import { describe, expect, it } from "vitest";
import { checkCalendarDay, checkDistributor, checkEmail, checkItem, checkShop } from "./validate";

const goodItem = { name: " Sugar 1 kg ", category: "Staples", pack: "1 kg", price: "45.50", distributorId: "D01", leadTimeDays: "2", minSafetyStock: 4, orderCoverDays: 7, openingStock: "12" };

describe("item set-up checks", () => {
  it("accepts a good item and tidies the text", () => {
    const r = checkItem(goodItem);
    expect(r).toEqual({ ok: true, value: { name: "Sugar 1 kg", category: "Staples", pack: "1 kg", price: 45.5, distributorId: "D01", leadTimeDays: 2, minSafetyStock: 4, orderCoverDays: 7, openingStock: 12 } });
  });
  it("rejects a missing name, a bad price and order cover under 1 day", () => {
    expect(checkItem({ ...goodItem, name: "  " })).toMatchObject({ ok: false });
    expect(checkItem({ ...goodItem, price: "forty" })).toMatchObject({ ok: false });
    expect(checkItem({ ...goodItem, price: -1 })).toMatchObject({ ok: false });
    expect(checkItem({ ...goodItem, orderCoverDays: 0 })).toMatchObject({ ok: false });
    expect(checkItem({ ...goodItem, leadTimeDays: 2.5 })).toMatchObject({ ok: false });
  });
  it("opening stock may be left empty", () => {
    expect(checkItem({ ...goodItem, openingStock: "" })).toMatchObject({ ok: true, value: { openingStock: 0 } });
  });
  it("does not crash on rubbish", () => {
    expect(checkItem(null)).toMatchObject({ ok: false });
    expect(checkItem("hello")).toMatchObject({ ok: false });
  });
});

describe("distributor checks", () => {
  it("needs a name and a sensible WhatsApp number", () => {
    expect(checkDistributor({ name: "Gupta Dairy", whatsapp: "+91 98765 43210" })).toMatchObject({ ok: true });
    expect(checkDistributor({ name: "Gupta Dairy" })).toMatchObject({ ok: true });
    expect(checkDistributor({ name: "" })).toMatchObject({ ok: false });
    expect(checkDistributor({ name: "X", whatsapp: "call me" })).toMatchObject({ ok: false });
  });
});

describe("helper email check", () => {
  it("accepts an email, lower-cases it, and rejects the rest", () => {
    expect(checkEmail(" Helper@Gmail.com ")).toEqual({ ok: true, value: "helper@gmail.com" });
    expect(checkEmail("helper")).toMatchObject({ ok: false });
    expect(checkEmail("a b@gmail.com")).toMatchObject({ ok: false });
  });
});

describe("festival calendar checks", () => {
  it("needs a real date, a name and extra sales of 0 to 200%", () => {
    expect(checkCalendarDay({ date: "2026-11-08", name: "Deepavali", upliftPct: "40" })).toEqual({ ok: true, value: { date: "2026-11-08", name: "Deepavali", upliftPct: 40 } });
    expect(checkCalendarDay({ date: "08-11-2026", name: "Deepavali", upliftPct: 40 })).toMatchObject({ ok: false });
    expect(checkCalendarDay({ date: "2026-13-45", name: "X", upliftPct: 10 })).toMatchObject({ ok: false });
    expect(checkCalendarDay({ date: "2026-11-08", name: "", upliftPct: 10 })).toMatchObject({ ok: false });
    expect(checkCalendarDay({ date: "2026-11-08", name: "X", upliftPct: 500 })).toMatchObject({ ok: false });
  });
});

describe("create your shop checks", () => {
  it("needs a name of 2 to 80 characters, a short place, and a yes to the privacy notice", () => {
    expect(checkShop({ name: "  Lakshmi Stores ", locality: " Adyar ", consent: true })).toEqual({ ok: true, value: { name: "Lakshmi Stores", locality: "Adyar", consent: true } });
    expect(checkShop({ name: "L", consent: true })).toMatchObject({ ok: false });
    expect(checkShop({ name: "x".repeat(81), consent: true })).toMatchObject({ ok: false });
    expect(checkShop({ name: "Lakshmi", locality: "y".repeat(81), consent: true })).toMatchObject({ ok: false });
    expect(checkShop({ name: "Lakshmi" })).toMatchObject({ ok: false });
    expect(checkShop({ name: "Lakshmi", consent: "true" })).toMatchObject({ ok: false }); // must be a real yes
    expect(checkShop(null)).toMatchObject({ ok: false });
  });
  it("the place may be left empty", () => {
    expect(checkShop({ name: "Lakshmi", consent: true })).toMatchObject({ ok: true, value: { locality: "" } });
  });
});
