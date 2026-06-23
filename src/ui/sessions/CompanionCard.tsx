/**
 * CompanionCard.tsx — pet summary for the tray popover (Phase 1).
 *
 * Shows avatar + name + level + mood status + XP progress + total tokens, using
 * only existing data (pet-store + xp-level). Client role, like the HUD: hydrate
 * once and mirror `tama:state` broadcasts — never ticks or saves.
 *
 * Phase 2-4 will add: today's token/feed counts, custom pet name, size slider.
 */

import { createSignal, onMount, onCleanup } from "solid-js";
import type { Component } from "solid-js";
import { initTamagotchi } from "../../tamagotchi/index.js";
import { getPetData, onPetDataChange } from "../../tamagotchi/pet-store.js";
import type { PetData } from "../../tamagotchi/types.js";
import { xpWithinLevel, xpForCurrentLevel } from "../../tamagotchi/xp-level.js";
import { petStatusLabel } from "../shared/pet-status.js";
import { formatTokens } from "../shared/session-format.js";

const CompanionCard: Component = () => {
  const [pet, setPet] = createSignal<PetData>(getPetData());

  onMount(async () => {
    // Client: load once + listen for the pet window's broadcasts.
    await initTamagotchi({ role: "client" });
    setPet(getPetData());
    const unsub = onPetDataChange((d) => setPet(d));
    onCleanup(unsub);
  });

  const status = () => petStatusLabel(pet().stats);
  const within = () => xpWithinLevel(pet().xp);
  const needed = () => xpForCurrentLevel(pet().xp);
  const pct = () => {
    const n = needed();
    return n > 0 ? Math.min(100, Math.round((within() / n) * 100)) : 0;
  };

  return (
    <div class="companion-card">
      <div class="companion-top">
        <span class="companion-avatar" aria-hidden="true">🟣</span>
        <div class="companion-id">
          <div class="companion-name-row">
            <span class="companion-name">Blobby</span>
            <span class="companion-level">Lv {pet().level}</span>
          </div>
          <span class={`companion-status companion-status--${status().tone}`}>
            {status().text}
          </span>
        </div>
      </div>

      <div
        class="companion-xp"
        role="progressbar"
        aria-label="XP"
        aria-valuenow={within()}
        aria-valuemin={0}
        aria-valuemax={needed()}
      >
        <div class="companion-xp-fill" style={{ width: `${pct()}%` }} />
      </div>

      <div class="companion-meta">
        <span>{within()} / {needed()} XP</span>
        <span>{formatTokens(pet().tokens)} token</span>
      </div>
    </div>
  );
};

export default CompanionCard;
