/**
 * pet-store.ts — @xstate/store single source of truth for PetData (Phase 04/05).
 *
 * IMPORTANT: This store holds Tamagotchi DATA (stats, xp, level, stage, tokens,
 * inventory, equipped). It is SEPARATE from src/pet/pet-state-machine.ts (animation FSM).
 * Phase 07 will wire data changes → animation transitions.
 *
 * Events:
 *   SET_DATA          — full replace (used on load / offline decay)
 *   APPLY_DECAY       — decay stats + update care score + check evolution
 *   ADD_XP            — add xp (positive or negative penalty)
 *   ADD_TOKENS        — increment token count
 *   ADJUST_STAT       — feed/pet: bump a single stat + optional xp
 *   SPEND_TOKENS      — deduct tokens (returns false via side-channel if insufficient)
 *   ADD_TO_INVENTORY  — add item id to owned inventory (cosmetics only; food consumed at buy)
 *   EQUIP_ITEM        — set equipped[slot] = itemId
 *   UNEQUIP_SLOT      — clear equipped[slot]
 */

import { createStore } from "@xstate/store";
import { defaultPetData, Stage, todayString } from "./types.js";
import type { PetData, Stats, CosmeticSlot } from "./types.js";
import { applyDecay, computeDailyCareScore, hasStatAtZero } from "./stats.js";
import { addXp } from "./xp-level.js";
import { checkEvolution, updateCareBuffer } from "./evolution.js";

/** Events accepted by the pet store. */
export type PetStoreEvent =
  | { type: "SET_DATA"; data: PetData }
  | { type: "APPLY_DECAY"; minutes: number }
  | { type: "ADD_XP"; amount: number }
  | { type: "ADD_TOKENS"; count: number }
  | { type: "SPEND_TOKENS"; count: number }
  | { type: "ADJUST_STAT"; stat: keyof Stats; delta: number; xpBonus?: number }
  | { type: "ADD_TO_INVENTORY"; itemId: string }
  | { type: "EQUIP_ITEM"; slot: CosmeticSlot; itemId: string }
  | { type: "UNEQUIP_SLOT"; slot: CosmeticSlot };

/** Create and export the store instance. */
export const petStore = createStore({
  context: defaultPetData(),

  on: {
    SET_DATA: (_context: PetData, event: { type: "SET_DATA"; data: PetData }) =>
      event.data,

    APPLY_DECAY: (context: PetData, event: { type: "APPLY_DECAY"; minutes: number }) => {
      const newStats = applyDecay(context.stats, event.minutes);

      // Faint penalty: if any stat hits 0, apply -5 XP and forced happiness note.
      let dataAfterPenalty = { ...context, stats: newStats };
      if (hasStatAtZero(newStats)) {
        dataAfterPenalty = addXp(dataAfterPenalty, -5);
      }

      // Daily care score: update buffer if day has rolled over.
      const today = todayString();
      let careBuffer = context.careScoreBuffer;
      let lastCareDay = context.lastCareDay;

      if (today !== lastCareDay) {
        const dailyScore = computeDailyCareScore(newStats);
        careBuffer = updateCareBuffer(careBuffer, dailyScore);
        lastCareDay = today;
      }

      // Evolution check.
      const newStage = checkEvolution(
        dataAfterPenalty.level,
        careBuffer,
        context.stage
      );

      return {
        ...dataAfterPenalty,
        careScoreBuffer: careBuffer,
        lastCareDay,
        stage: newStage,
      };
    },

    ADD_XP: (context: PetData, event: { type: "ADD_XP"; amount: number }) => {
      const updated = addXp(context, event.amount);
      // Check if level-up triggers evolution.
      const newStage = checkEvolution(
        updated.level,
        context.careScoreBuffer,
        context.stage
      );
      return { ...updated, stage: newStage };
    },

    ADD_TOKENS: (context: PetData, event: { type: "ADD_TOKENS"; count: number }) => ({
      ...context,
      tokens: context.tokens + event.count,
    }),

    // SPEND_TOKENS: deduct tokens; no-op if insufficient (balance stays non-negative).
    // economy.ts checks balance before dispatching — this is a defensive guard.
    SPEND_TOKENS: (context: PetData, event: { type: "SPEND_TOKENS"; count: number }) => {
      if (context.tokens < event.count) return context; // Guard: never go negative.
      return { ...context, tokens: context.tokens - event.count };
    },

    ADD_TO_INVENTORY: (context: PetData, event: { type: "ADD_TO_INVENTORY"; itemId: string }) => ({
      ...context,
      inventory: context.inventory.includes(event.itemId)
        ? context.inventory
        : [...context.inventory, event.itemId],
    }),

    EQUIP_ITEM: (context: PetData, event: { type: "EQUIP_ITEM"; slot: CosmeticSlot; itemId: string }) => ({
      ...context,
      equipped: { ...context.equipped, [event.slot]: event.itemId },
    }),

    UNEQUIP_SLOT: (context: PetData, event: { type: "UNEQUIP_SLOT"; slot: CosmeticSlot }) => {
      const equipped = { ...context.equipped };
      delete equipped[event.slot];
      return { ...context, equipped };
    },

    ADJUST_STAT: (
      context: PetData,
      event: { type: "ADJUST_STAT"; stat: keyof Stats; delta: number; xpBonus?: number }
    ) => {
      const newVal = Math.max(0, Math.min(100, context.stats[event.stat] + event.delta));
      const newStats: Stats = { ...context.stats, [event.stat]: newVal };
      let updated: PetData = { ...context, stats: newStats };
      if (event.xpBonus) {
        updated = addXp(updated, event.xpBonus);
        const newStage = checkEvolution(
          updated.level,
          context.careScoreBuffer,
          context.stage
        );
        updated = { ...updated, stage: newStage };
      }
      return updated;
    },
  },
});

/** Subscribe to state changes. Returns unsubscribe function. */
export function onPetDataChange(
  listener: (data: PetData) => void
): () => void {
  const sub = petStore.subscribe((snapshot) => {
    listener(snapshot.context);
  });
  // @xstate/store subscribe returns an object with unsubscribe method.
  return () => sub.unsubscribe();
}

/** Read current pet data snapshot (synchronous). */
export function getPetData(): PetData {
  return petStore.getSnapshot().context;
}

/** Dispatch a store event. */
export function dispatch(event: PetStoreEvent): void {
  petStore.send(event);
}

/** Convenience: is the pet at any evolution stage above Egg? */
export function isEvolved(): boolean {
  return getPetData().stage !== Stage.Egg;
}
