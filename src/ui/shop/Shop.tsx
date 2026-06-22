/**
 * Shop.tsx — Main shop window component (Phase 05).
 *
 * Tabs: Food | Cosmetics
 * Shows balance (violet coin), item grid, and handles buy/equip/unequip.
 *
 * DUAL-WINDOW: This runs in the shop (client) process. All mutations are
 * sent to the owner (pet window) via emitMutation("tama:mutate"). The owner
 * applies logic, persists, and broadcasts "tama:state" back. Local pet-store
 * is updated by the tama:state listener in initTamagotchi({ role: "client" }).
 *
 * UI re-renders on store change via onPetDataChange subscription.
 */

import { createSignal, onCleanup, For, Show } from "solid-js";
import type { Component } from "solid-js";

import { getCatalog } from "../../economy/item-catalog.js";
import type { ShopItem, CosmeticItem } from "../../economy/item-catalog.js";
import { getPetData } from "../../tamagotchi/pet-store.js";
import { onPetDataChange } from "../../tamagotchi/pet-store.js";
import { emitMutation } from "../../tamagotchi/index.js";

type Tab = "food" | "cosmetics";

interface Toast {
  id: number;
  message: string;
}

let _toastId = 0;

const Shop: Component = () => {
  const catalog = getCatalog();

  // ── Reactive state ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = createSignal<Tab>("food");

  // Snapshot of PetData for reactive reads. Updated on every tama:state broadcast.
  const [petData, setPetData] = createSignal(getPetData());
  const [toasts, setToasts] = createSignal<Toast[]>([]);

  const unsub = onPetDataChange((data) => setPetData(data));
  onCleanup(unsub);

  // ── Derived reads (all from petData signal — reactive) ─────────────────────
  const balance = () => petData().tokens;
  const owned = (id: string) => petData().inventory.includes(id);
  const equippedMap = () => petData().equipped;
  const isEquipped = (id: string) => Object.values(equippedMap()).includes(id);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function showToast(message: string): void {
    const id = ++_toastId;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 1800);
  }

  // ── Mutation handlers — emit to owner, never mutate locally ─────────────────

  function handleBuy(item: ShopItem): void {
    if (balance() < item.price) {
      showToast("❌ Not enough tokens!");
      return;
    }
    if (item.kind === "cosmetic" && owned(item.id)) {
      showToast("❌ Already owned!");
      return;
    }

    const mutatePayload =
      item.kind === "food"
        ? { action: "buy_food" as const, itemId: item.id }
        : { action: "buy_cosmetic" as const, itemId: item.id };

    emitMutation(mutatePayload).catch(() => {
      showToast("❌ Network error — try again.");
    });

    // Optimistic feedback — owner will confirm via tama:state broadcast.
    showToast(
      item.kind === "food"
        ? `${item.emoji} Fed your pet!`
        : `${item.emoji} ${item.name} added to wardrobe!`
    );
  }

  function handleEquip(item: ShopItem): void {
    if (item.kind !== "cosmetic") return;
    emitMutation({ action: "equip", itemId: item.id }).catch(() => {
      showToast("❌ Network error.");
    });
    showToast("✨ Equipped!");
  }

  function handleUnequip(item: ShopItem): void {
    // H1 fix: use item.slot directly from the typed CosmeticItem — no blind cast.
    if (item.kind !== "cosmetic") return;
    const cosmeticItem = item as CosmeticItem;
    emitMutation({ action: "unequip", slot: cosmeticItem.slot }).catch(() => {
      showToast("❌ Network error.");
    });
    showToast("Unequipped.");
  }

  // ── Derived item list (keyed by tab) ────────────────────────────────────────
  const items = (): ShopItem[] =>
    activeTab() === "food"
      ? (catalog.food as ShopItem[])
      : (catalog.cosmetics as ShopItem[]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div id="shop-root">
      {/* Header */}
      <header class="shop-header">
        <span class="shop-title">🛒 Shop</span>
        <div class="shop-balance" title="Token balance">
          <span class="shop-balance__coin" aria-hidden="true" />
          <span class="shop-balance__amount">{balance()}</span>
        </div>
      </header>

      {/* Tabs */}
      <nav class="shop-tabs" aria-label="Shop categories">
        <button
          class="shop-tab"
          classList={{ "shop-tab--active": activeTab() === "food" }}
          onClick={() => setActiveTab("food")}
        >
          🍪 Food
        </button>
        <button
          class="shop-tab"
          classList={{ "shop-tab--active": activeTab() === "cosmetics" }}
          onClick={() => setActiveTab("cosmetics")}
        >
          ✨ Cosmetics
        </button>
      </nav>

      {/* Item grid */}
      <div class="shop-grid-wrapper">
        <div class="shop-grid">
          <For each={items()}>
            {(item) => {
              const itemOwned = () => item.kind === "cosmetic" && owned(item.id);
              const itemEquipped = () => item.kind === "cosmetic" && isEquipped(item.id);

              return (
                <div
                  class="shop-card"
                  classList={{
                    "shop-card--owned": itemOwned(),
                    "shop-card--equipped": itemEquipped(),
                  }}
                >
                  {/* Status badges */}
                  <Show when={itemEquipped()}>
                    <span class="shop-card__badge shop-card__badge--equipped">Equipped</span>
                  </Show>
                  <Show when={itemOwned() && !itemEquipped()}>
                    <span class="shop-card__badge shop-card__badge--owned">Owned</span>
                  </Show>

                  <div class="shop-card__emoji">{item.emoji}</div>
                  <div class="shop-card__name" title={item.name}>{item.name}</div>
                  <div class="shop-card__desc">{item.description}</div>

                  <div class="shop-card__price-row">
                    <span class="shop-card__coin" aria-hidden="true" />
                    <span class="shop-card__price">{item.price}</span>
                  </div>

                  {/* Action button */}
                  <Show
                    when={itemOwned()}
                    fallback={
                      /* Not owned (or food) → Buy */
                      <button
                        class="shop-btn shop-btn--buy"
                        disabled={balance() < item.price}
                        onClick={() => handleBuy(item)}
                      >
                        {balance() >= item.price ? "Buy" : "Need tokens"}
                      </button>
                    }
                  >
                    {/* Owned cosmetic → Equip or Unequip */}
                    <Show
                      when={itemEquipped()}
                      fallback={
                        <button
                          class="shop-btn shop-btn--equip"
                          onClick={() => handleEquip(item)}
                        >
                          Equip
                        </button>
                      }
                    >
                      <button
                        class="shop-btn shop-btn--unequip"
                        onClick={() => handleUnequip(item)}
                      >
                        Unequip
                      </button>
                    </Show>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </div>

      {/* Toast notifications */}
      <For each={toasts()}>
        {(toast) => <div class="shop-toast">{toast.message}</div>}
      </For>
    </div>
  );
};

export default Shop;
