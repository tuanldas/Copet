/**
 * inventory.test.ts — Unit tests for buy / equip / unequip / persist round-trip.
 *
 * Uses real pet-store (in-memory) reset between tests. No Tauri IPC needed.
 * item-catalog is loaded from the real items.json via import.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { dispatch, getPetData } from "../../tamagotchi/pet-store.js";
import { defaultPetData } from "../../tamagotchi/types.js";
import { getCatalog } from "../item-catalog.js";
import {
  buy,
  equip,
  unequip,
  getInventory,
  getEquipped,
  isOwned,
  isEquipped,
} from "../inventory.js";

/** Reset store to a fresh pet with a given token balance. */
function resetWith(tokens: number): void {
  dispatch({ type: "SET_DATA", data: { ...defaultPetData(), tokens } });
}

// Grab stable references from catalog once.
const catalog = getCatalog();
const kibble = catalog.food.find((f) => f.id === "food_kibble")!;
const wizard = catalog.cosmetics.find((c) => c.id === "cosmetic_hat_wizard")!;
const cap = catalog.cosmetics.find((c) => c.id === "cosmetic_hat_cap")!;
const glasses = catalog.cosmetics.find((c) => c.id === "cosmetic_acc_glasses")!;
const bow = catalog.cosmetics.find((c) => c.id === "cosmetic_acc_bow")!;

// Verify catalog loaded correctly — fail fast if items.json changed.
describe("catalog sanity", () => {
  it("has food and cosmetic items loaded", () => {
    expect(kibble).toBeDefined();
    expect(wizard).toBeDefined();
    expect(wizard.kind).toBe("cosmetic");
    expect(kibble.kind).toBe("food");
  });
});

// ── buy() ─────────────────────────────────────────────────────────────────────

describe("inventory — buy food", () => {
  beforeEach(() => resetWith(50));

  it("deducts price from balance on success", () => {
    const result = buy(kibble);
    expect(result.ok).toBe(true);
    const { tokens } = getPetData();
    expect(tokens).toBe(50 - kibble.price);
  });

  it("food is NOT added to inventory (consumed immediately)", () => {
    buy(kibble);
    expect(getInventory()).not.toContain(kibble.id);
  });

  it("food applies stat effect (hunger increases)", () => {
    // Set hunger to 0 first.
    dispatch({
      type: "SET_DATA",
      data: { ...defaultPetData(), tokens: 50, stats: { hunger: 0, energy: 80, happiness: 80, hygiene: 80 } },
    });
    buy(kibble);
    const { stats } = getPetData();
    expect(stats.hunger).toBeGreaterThan(0);
    expect(stats.hunger).toBe(kibble.amount); // 0 + 20 = 20
  });

  it("returns insufficient_tokens when balance is too low", () => {
    resetWith(3); // kibble costs 5
    const result = buy(kibble);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("insufficient_tokens");
  });

  it("can buy food multiple times (consumable, no inventory dedup)", () => {
    const r1 = buy(kibble);
    const r2 = buy(kibble);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(getPetData().tokens).toBe(50 - kibble.price * 2);
  });
});

describe("inventory — buy cosmetic", () => {
  beforeEach(() => resetWith(100));

  it("adds cosmetic to inventory on success", () => {
    const result = buy(wizard);
    expect(result.ok).toBe(true);
    expect(getInventory()).toContain(wizard.id);
  });

  it("deducts price from balance", () => {
    buy(wizard);
    expect(getPetData().tokens).toBe(100 - wizard.price);
  });

  it("returns already_owned on re-purchase attempt", () => {
    buy(wizard);
    const r2 = buy(wizard);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe("already_owned");
  });

  it("balance unchanged after already_owned rejection", () => {
    buy(wizard);
    const balanceBefore = getPetData().tokens;
    buy(wizard); // should be rejected
    expect(getPetData().tokens).toBe(balanceBefore);
  });

  it("returns insufficient_tokens when broke", () => {
    resetWith(10); // wizard costs 40
    const result = buy(wizard);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("insufficient_tokens");
    expect(getInventory()).not.toContain(wizard.id);
  });
});

// ── equip() ───────────────────────────────────────────────────────────────────

describe("inventory — equip", () => {
  beforeEach(() => {
    resetWith(200);
    buy(wizard);
    buy(cap);
    buy(glasses);
  });

  it("equips an owned cosmetic to its slot", () => {
    const ok = equip(wizard.id);
    expect(ok).toBe(true);
    expect(getEquipped().hat).toBe(wizard.id);
  });

  it("replacing slot — equip cap removes wizard from hat slot", () => {
    equip(wizard.id);
    equip(cap.id); // cap is also hat slot
    expect(getEquipped().hat).toBe(cap.id);
    // Only one item per slot.
    const values = Object.values(getEquipped());
    const hatCount = values.filter(() => getEquipped().hat !== undefined).length;
    expect(hatCount).toBeLessThanOrEqual(1);
  });

  it("different slots coexist (hat + accessory)", () => {
    equip(wizard.id);
    equip(glasses.id);
    expect(getEquipped().hat).toBe(wizard.id);
    expect(getEquipped().accessory).toBe(glasses.id);
  });

  it("returns false for unowned item", () => {
    const ok = equip(bow.id); // bow not bought
    expect(ok).toBe(false);
  });

  it("isEquipped returns true after equipping", () => {
    equip(wizard.id);
    expect(isEquipped(wizard.id)).toBe(true);
  });

  it("isEquipped returns false when not equipped", () => {
    expect(isEquipped(wizard.id)).toBe(false);
  });
});

// ── unequip() ─────────────────────────────────────────────────────────────────

describe("inventory — unequip", () => {
  beforeEach(() => {
    resetWith(200);
    buy(wizard);
    equip(wizard.id);
  });

  it("clears the slot after unequip", () => {
    unequip("hat");
    expect(getEquipped().hat).toBeUndefined();
  });

  it("isEquipped returns false after unequip", () => {
    unequip("hat");
    expect(isEquipped(wizard.id)).toBe(false);
  });

  it("no-op if slot already empty", () => {
    unequip("accessory"); // nothing equipped there
    expect(getEquipped().accessory).toBeUndefined();
  });
});

// ── Persist round-trip ────────────────────────────────────────────────────────

describe("inventory — persist round-trip via pet-store", () => {
  it("inventory and equipped survive a SET_DATA restore (simulates reload)", () => {
    resetWith(200);
    buy(wizard);
    buy(glasses);
    equip(wizard.id);
    equip(glasses.id);

    // Snapshot current state.
    const snapshot = getPetData();

    // Simulate reload: dispatch SET_DATA with the snapshot (as persistence.ts does).
    dispatch({ type: "SET_DATA", data: snapshot });

    // All data must be restored.
    expect(getInventory()).toContain(wizard.id);
    expect(getInventory()).toContain(glasses.id);
    expect(getEquipped().hat).toBe(wizard.id);
    expect(getEquipped().accessory).toBe(glasses.id);
    expect(isOwned(wizard.id)).toBe(true);
    expect(isEquipped(wizard.id)).toBe(true);
  });

  it("1 item per slot invariant holds after round-trip", () => {
    resetWith(200);
    buy(wizard);
    buy(cap);
    equip(wizard.id);
    equip(cap.id); // replaces wizard in hat slot

    const snapshot = getPetData();
    dispatch({ type: "SET_DATA", data: snapshot });

    // Only cap should be in hat slot (wizard was replaced).
    expect(getEquipped().hat).toBe(cap.id);
    // wizard remains in inventory (unequipped, but owned).
    expect(isOwned(wizard.id)).toBe(true);
    expect(isEquipped(wizard.id)).toBe(false);
  });
});

// ── isOwned ───────────────────────────────────────────────────────────────────

describe("inventory — isOwned", () => {
  beforeEach(() => resetWith(200));

  it("returns false before purchase", () => {
    expect(isOwned(wizard.id)).toBe(false);
  });

  it("returns true after purchase", () => {
    buy(wizard);
    expect(isOwned(wizard.id)).toBe(true);
  });
});
