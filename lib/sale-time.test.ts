import { describe, expect, it } from "vitest";
import { demoStore } from "@/lib/data/demo";
import { cleanTapTime } from "./sale-time";

const NOW = Date.parse("2026-11-20T10:00:00Z");

describe("the tap time sent with a sale saved offline", () => {
  it("a recent whole number is kept as a date", () => {
    expect(cleanTapTime(NOW - 60_000, NOW)?.getTime()).toBe(NOW - 60_000);
    expect(cleanTapTime(NOW - 13 * 24 * 3600 * 1000, NOW)).not.toBeNull(); // offline for 13 days
  });
  it("anything odd is ignored (the sale is then an ordinary sale)", () => {
    expect(cleanTapTime(undefined, NOW)).toBeNull();
    expect(cleanTapTime(null, NOW)).toBeNull();
    expect(cleanTapTime("123", NOW)).toBeNull();
    expect(cleanTapTime(NOW - 1000.5, NOW)).toBeNull();
    expect(cleanTapTime(NOW - 15 * 24 * 3600 * 1000, NOW)).toBeNull(); // too old
    expect(cleanTapTime(NOW + 10 * 60 * 1000, NOW)).toBeNull(); // in the future
  });
  it("a phone clock a minute fast is accepted", () => {
    expect(cleanTapTime(NOW + 60_000, NOW)).not.toBeNull();
  });
});

describe("addSale with a tap time (the same sale sent twice is recorded once)", () => {
  it("the same item and tap moment changes stock once; a different moment is a new sale", async () => {
    const [item] = await demoStore.listItems();
    const before = item.currentStock;
    const at = new Date(Date.now() - 5000);
    await demoStore.addSale(item.id, 1, "Quick tap", at);
    await demoStore.addSale(item.id, 1, "Quick tap", at); // the repeat
    const mid = (await demoStore.listItems()).find((i) => i.id === item.id)!.currentStock;
    expect(before - mid).toBe(1);
    await demoStore.addSale(item.id, 1, "Quick tap", new Date(at.getTime() + 1));
    const after = (await demoStore.listItems()).find((i) => i.id === item.id)!.currentStock;
    expect(before - after).toBe(2);
  });
  it("a sale with no tap time (the normal online tap) is never treated as a repeat", async () => {
    const [item] = await demoStore.listItems();
    const before = (await demoStore.listItems()).find((i) => i.id === item.id)!.currentStock;
    await demoStore.addSale(item.id, 1, "Quick tap");
    await demoStore.addSale(item.id, 1, "Quick tap");
    const after = (await demoStore.listItems()).find((i) => i.id === item.id)!.currentStock;
    expect(before - after).toBe(2);
  });
});
