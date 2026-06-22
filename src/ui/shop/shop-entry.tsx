/**
 * shop-entry.tsx — SolidJS mount point for the shop window (Phase 05).
 *
 * Role: "client" — read-only mirror of the owner (pet window).
 *
 * Architecture:
 *   - initTamagotchi({ role: "client" }): loads once for initial display,
 *     then listens to "tama:state" broadcasts from the owner. NEVER saves
 *     or ticks — all writes go through the owner via "tama:mutate" events.
 *   - Shop mutations (buy/equip/unequip) call emitMutation() which sends
 *     "tama:mutate" to the owner; the owner applies, saves, and broadcasts
 *     the new "tama:state" back — local store updates automatically.
 */

import { render } from "solid-js/web";
import { initTamagotchi } from "../../tamagotchi/index.js";
import Shop from "./Shop.js";
import "./shop.css";

async function bootstrap(): Promise<void> {
  // Client role: hydrate local store from disk for immediate display;
  // subscribe to tama:state broadcasts; never tick or save.
  await initTamagotchi({ role: "client" });

  const root = document.getElementById("shop-root");
  if (!root) {
    console.error("[shop-entry] #shop-root element not found in shop.html");
    return;
  }

  render(() => <Shop />, root);
}

bootstrap().catch((err: unknown) => {
  console.error("[shop-entry] bootstrap failed:", err);
});
