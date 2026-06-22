/**
 * pet-state-machine.ts
 * @xstate/store state machine cho Copet pet.
 * States: idle | walk | drag | sleep | eat | working | celebrate | error | evolve
 * Events: TICK | FEED | PET | DRAG_START | DRAG_END | AGENT_EVENT | SLEEP | WAKE | ANIM_DONE
 *
 * Priority (cao → thấp): drag > sleep_forced > agent_state > mood/idle
 * CHỈ import từ @xstate/store — KHÔNG import từ "xstate" full (~40KB).
 *
 * Transient (one-shot) states: eat, celebrate, error, evolve.
 * Caller PHẢI gửi ANIM_DONE sau khi animation kết thúc → state tự về base.
 * agentState bị reset về "idle" khi revert khỏi celebrate/error để
 * resolveState không trả lại celebrate/error liên tục.
 */

import { createStore } from "@xstate/store";

/** Tất cả states mà pet có thể ở */
export type PetState =
  | "idle"
  | "walk"
  | "drag"
  | "sleep"
  | "eat"
  | "working"
  | "celebrate"
  | "error"
  | "evolve";

/** Agent event từ MCP/tool layer (Phase 07 sẽ emit thật; giờ stub bằng auto-cycle) */
export type AgentEventType = "working" | "done_success" | "done_error" | "idle";

/**
 * Các state chỉ chạy 1 lần (không loop) — sau khi kết thúc phải revert về base.
 * Đây là nguồn sự thật duy nhất cho caller (index.ts) để biết nên hẹn ANIM_DONE.
 */
export const TRANSIENT_STATES = new Set<PetState>([
  "eat",
  "celebrate",
  "error",
  "evolve",
]);

/** Context của store — mô tả trạng thái đầy đủ */
export interface PetContext {
  /** State animation hiện tại */
  current: PetState;
  /** State trước đó (để restore sau drag/transient) */
  prev: PetState;
  /** Sleep bị ép bởi energy thấp (không tự wake được) */
  sleepForced: boolean;
  /** Agent đang ở trạng thái nào */
  agentState: AgentEventType;
}

const initialContext: PetContext = {
  current: "idle",
  prev: "idle",
  sleepForced: false,
  agentState: "idle",
};

/**
 * Tính base state sau khi transient kết thúc theo priority:
 *   drag > sleep_forced > working > idle/walk (prev)
 * Lưu ý: khi gọi từ ANIM_DONE, agentState đã được reset về "idle"
 * (celebrate/error) để tránh vòng lặp.
 */
function resolveBaseState(ctx: PetContext): PetState {
  if (ctx.current === "drag") return "drag";
  if (ctx.sleepForced) return "sleep";

  switch (ctx.agentState) {
    case "working":
      return "working";
    // done_success/done_error không được resolve ở đây —
    // chúng đã được xử lý khi AGENT_EVENT được gửi và
    // sẽ không còn tồn tại sau ANIM_DONE reset về idle.
    default:
      break;
  }

  // Fallback: giữ prev (idle/walk) hoặc idle
  const safePrev: PetState =
    ctx.prev === "idle" || ctx.prev === "walk" ? ctx.prev : "idle";
  return safePrev;
}

/** @xstate/store instance */
export const petStore = createStore({
  context: initialContext,

  on: {
    /** Tick định kỳ: random walk khi idle */
    TICK: (ctx: PetContext) => {
      if (ctx.current === "drag" || ctx.sleepForced) return ctx;
      if (ctx.agentState !== "idle") return ctx;
      // Không interrupt transient state bằng TICK
      if (TRANSIENT_STATES.has(ctx.current)) return ctx;

      // 15% chance đổi giữa idle ↔ walk mỗi tick
      if (Math.random() < 0.15) {
        const next: PetState = ctx.current === "idle" ? "walk" : "idle";
        return { ...ctx, current: next, prev: ctx.current };
      }
      return ctx;
    },

    /**
     * Cho ăn: chuyển sang eat (transient).
     * Caller trong index.ts sẽ hẹn ANIM_DONE sau (frames/fps * 1000) ms.
     */
    FEED: (ctx: PetContext) => {
      if (ctx.current === "drag") return ctx;
      if (TRANSIENT_STATES.has(ctx.current)) return ctx; // không interrupt
      return { ...ctx, prev: ctx.current, current: "eat" as PetState };
    },

    /** Vuốt ve: trigger idle (celebrate đã không còn dùng ở đây, agentState quyết định) */
    PET: (ctx: PetContext) => {
      if (ctx.current === "drag") return ctx;
      if (TRANSIENT_STATES.has(ctx.current)) return ctx;
      return { ...ctx, prev: ctx.current, current: "idle" as PetState };
    },

    /** Bắt đầu kéo: override mọi state */
    DRAG_START: (ctx: PetContext) => ({
      ...ctx,
      prev: TRANSIENT_STATES.has(ctx.current) ? ctx.prev : ctx.current,
      current: "drag" as PetState,
    }),

    /** Kết thúc kéo: khôi phục state trước đó */
    DRAG_END: (ctx: PetContext) => {
      const base = resolveBaseState({ ...ctx, current: ctx.prev });
      return { ...ctx, current: base };
    },

    /**
     * Agent event từ MCP layer.
     * done_success → celebrate (transient), done_error → error (transient).
     * Caller trong index.ts hẹn ANIM_DONE sau khi animation kết thúc.
     */
    AGENT_EVENT: (ctx: PetContext, event: { agentState: AgentEventType }) => {
      // Không interrupt drag
      if (ctx.current === "drag") return { ...ctx, agentState: event.agentState };

      const newAgentState = event.agentState;
      let next: PetState;

      switch (newAgentState) {
        case "working":
          next = "working";
          break;
        case "done_success":
          next = "celebrate";
          break;
        case "done_error":
          next = "error";
          break;
        default:
          next = ctx.prev === "idle" || ctx.prev === "walk" ? ctx.prev : "idle";
          break;
      }

      return {
        ...ctx,
        agentState: newAgentState,
        prev: TRANSIENT_STATES.has(ctx.current) ? ctx.prev : ctx.current,
        current: next,
      };
    },

    /**
     * ANIM_DONE: gửi khi animation transient/one-shot kết thúc.
     * Reset agentState về "idle" nếu đang ở celebrate/error để resolveBase
     * không loop lại celebrate/error.
     * Loop states (idle/walk/sleep/working) bỏ qua event này.
     */
    ANIM_DONE: (ctx: PetContext) => {
      if (!TRANSIENT_STATES.has(ctx.current)) return ctx;

      // Reset agentState nếu vừa kết thúc celebrate/error
      const newAgentState: AgentEventType =
        ctx.current === "celebrate" || ctx.current === "error"
          ? "idle"
          : ctx.agentState;

      const base = resolveBaseState({
        ...ctx,
        agentState: newAgentState,
        current: ctx.prev,
      });

      return {
        ...ctx,
        agentState: newAgentState,
        prev: ctx.current,
        current: base,
      };
    },

    /** Bắt đầu ngủ (do energy thấp hoặc idle lâu) */
    SLEEP: (ctx: PetContext, event: { forced?: boolean }) => {
      if (ctx.current === "drag") return ctx;
      return {
        ...ctx,
        prev: ctx.current,
        current: "sleep" as PetState,
        sleepForced: event.forced ?? false,
      };
    },

    /** Thức dậy: bỏ cờ sleep_forced và trở về base state */
    WAKE: (ctx: PetContext) => {
      const updated = { ...ctx, sleepForced: false };
      const base = resolveBaseState({ ...updated, current: ctx.prev });
      return { ...updated, current: base };
    },
  },
});

/** Lấy context hiện tại */
export function getPetContext(): PetContext {
  return petStore.getSnapshot().context;
}

/** Lấy state hiện tại */
export function getPetState(): PetState {
  return getPetContext().current;
}
