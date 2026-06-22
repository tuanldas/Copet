/**
 * StatsHud.tsx — Stats HUD panel root component (Phase 06).
 *
 * Layout (top→bottom):
 *   - Pet portrait: static idle-frame crop from blobby spritesheet via canvas.
 *   - Level badge + XP ring (SVG arc, fills left→right).
 *   - 4 stat bars: hunger / energy / happiness / hygiene (colour-coded).
 *   - Agent status row (icon + name + state dot).
 *
 * Data source: initTamagotchi({ role: 'client' }) — load once + listen tama:state.
 * Never ticks or saves. Single writer is the pet window.
 */

import { createSignal, onMount, onCleanup } from "solid-js";
import type { Component } from "solid-js";
import { initTamagotchi } from "../../tamagotchi/index.js";
import { getPetData, onPetDataChange } from "../../tamagotchi/pet-store.js";
import type { PetData } from "../../tamagotchi/types.js";
// Use canonical engine functions — single source of truth for XP math.
import { xpWithinLevel, xpForCurrentLevel } from "../../tamagotchi/xp-level.js";
import StatBar from "./StatBar.js";
import AgentStatusRow from "./AgentStatusRow.js";

// SVG arc ring constants (r=32, cx=40, cy=40).
const RING_R = 32;
const RING_CX = 40;
const RING_CY = 40;
const RING_CIRC = 2 * Math.PI * RING_R; // ≈ 201

/**
 * Compute stroke-dashoffset for the XP ring.
 * Uses engine-canonical xpWithinLevel / xpForCurrentLevel — no local reimpl.
 */
function xpArcDashoffset(totalXp: number): number {
  const within = xpWithinLevel(totalXp);
  const needed = xpForCurrentLevel(totalXp);
  const progress = needed > 0 ? Math.min(1, within / needed) : 0;
  return RING_CIRC * (1 - progress);
}

const StatsHud: Component = () => {
  const [pet, setPet] = createSignal<PetData>(getPetData());

  onMount(async () => {
    // Client role: hydrate once + mirror tama:state broadcasts. No tick/save.
    await initTamagotchi({ role: "client" });
    setPet(getPetData());

    const unsub = onPetDataChange((data) => setPet(data));
    onCleanup(unsub);
  });

  const stats = () => pet().stats;
  const level = () => pet().level;
  const xp = () => pet().xp;
  const stage = () => pet().stage;
  const dashoffset = () => xpArcDashoffset(xp());
  const xpMax = () => xpForCurrentLevel(xp());

  return (
    <div id="hud-root">
      {/* ── Pet portrait ──────────────────────────────────────────────────── */}
      <div class="hud-portrait" aria-label={`Pet stage: ${stage()}`}>
        {/*
          Static idle frame: blobby spritesheet row 0, col 0.
          96×104 logical px, CSS image-rendering: pixelated.
          Tauri serves /assets/pets/blobby/spritesheet.png from public/.
        */}
        <canvas
          id="hud-portrait-canvas"
          width="96"
          height="104"
          aria-hidden="true"
          ref={(el) => drawPortrait(el)}
        />
      </div>

      {/* ── Level + XP ring ───────────────────────────────────────────────── */}
      <div class="hud-level-row">
        <svg
          class="xp-ring"
          width="80"
          height="80"
          viewBox="0 0 80 80"
          role="progressbar"
          aria-label={`Level ${level()}, XP ${xp()}`}
          aria-valuenow={xp()}
          aria-valuemin={0}
          aria-valuemax={xpMax()}
        >
          {/* Track ring */}
          <circle
            cx={RING_CX} cy={RING_CY} r={RING_R}
            fill="none"
            stroke="var(--color-border)"
            stroke-width="6"
          />
          {/* Fill arc */}
          <circle
            cx={RING_CX} cy={RING_CY} r={RING_R}
            fill="none"
            stroke="var(--color-accent)"
            stroke-width="6"
            stroke-linecap="round"
            stroke-dasharray={String(RING_CIRC)}
            stroke-dashoffset={String(dashoffset())}
            transform="rotate(-90 40 40)"
            style={{ transition: `stroke-dashoffset var(--duration-normal) var(--ease-out)` }}
          />
          {/* Level number */}
          <text
            x={RING_CX} y={RING_CY + 1}
            text-anchor="middle"
            dominant-baseline="middle"
            class="xp-level-text"
          >
            {level()}
          </text>
          {/* "LV" label */}
          <text
            x={RING_CX} y={RING_CY + 13}
            text-anchor="middle"
            dominant-baseline="middle"
            class="xp-lv-label"
          >
            LV
          </text>
        </svg>

        <div class="hud-stage-badge" title={`Stage: ${stage()}`}>
          {stage()}
        </div>
      </div>

      {/* ── 4 Stat bars ───────────────────────────────────────────────────── */}
      <div class="hud-stats">
        <StatBar icon="🍗" label="Hunger"    value={stats().hunger}    />
        <StatBar icon="⚡" label="Energy"    value={stats().energy}    />
        <StatBar icon="❤" label="Happiness" value={stats().happiness} />
        <StatBar icon="✨" label="Hygiene"   value={stats().hygiene}   />
      </div>

      {/* ── Agent status ──────────────────────────────────────────────────── */}
      <div class="hud-agent-section">
        <AgentStatusRow />
      </div>
    </div>
  );
};

/**
 * Draw the pet's idle frame (row 0, col 0) onto the portrait canvas.
 * Spritesheet: 192×208 grid, 8 cols × ~9 rows, each frame 24×23px (rounded).
 * We scale to 96×104 (2×) for a crisp pixel-art display.
 */
function drawPortrait(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const img = new Image();
  img.src = "/assets/pets/blobby/spritesheet.png";
  img.onload = () => {
    // Frame 0,0: source x=0, y=0, w=24, h=23 (from pet.json grid 192×208, 8×9).
    const srcW = Math.floor(192 / 8);  // 24
    const srcH = Math.floor(208 / 9);  // 23
    ctx.imageSmoothingEnabled = false;  // pixelated
    ctx.drawImage(img, 0, 0, srcW, srcH, 0, 0, 96, 104);
  };
  img.onerror = () => {
    // Fallback: fill with surface colour + "?" placeholder.
    ctx.fillStyle = "#2A2A3C";
    ctx.fillRect(0, 0, 96, 104);
    ctx.fillStyle = "#ECECF4";
    ctx.font = "bold 32px monospace";
    ctx.textAlign = "center";
    ctx.fillText("?", 48, 62);
  };
}

export default StatsHud;
