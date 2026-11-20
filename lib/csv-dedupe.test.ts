import { describe, expect, it } from "vitest";
import { demoStore } from "@/lib/data/demo";
import { parseSalesCsv } from "@/lib/csv";
import { splitDuplicates } from "./csv-dedupe";

type R = { item: string; date: string; qty: number };
const key = (r: R) => `${r.item}|${r.date}|${r.qty}`;
const a: R = { item: "Sugar", date: "2026-08-10", qty: 2 }, b: R = { item: "Sugar", date: "2026-08-11", qty: 2 }, c: R = { item: "Tea", date: "2026-08-10", qty: 1 };

describe("the same sales file uploaded twice (FR2)", () => {
  it("nothing saved before: every row is new", () => {
    const r = splitDuplicates([a, b, c], [], key);
    expect(r.fresh).toEqual([a, b, c]);
    expect(r.duplicates).toEqual([]);
  });
  it("the whole file again: every row is a repeat, nothing new is saved", () => {
    const r = splitDuplicates([a, b, c], [a, b, c], key);
    expect(r.fresh).toEqual([]);
    expect(r.duplicates.length).toBe(3);
  });
  it("a file with some new rows: only the new rows are saved", () => {
    const r = splitDuplicates([a, b, c], [a], key);
    expect(r.fresh).toEqual([b, c]);
    expect(r.duplicates).toEqual([a]);
  });
  it("a different quantity for the same item and day is a different sale, not a repeat", () => {
    const r = splitDuplicates([{ ...a, qty: 5 }], [a], key);
    expect(r.fresh.length).toBe(1);
  });
  it("two identical rows in one file are both kept the first time (they are counted, not collapsed)", () => {
    const r = splitDuplicates([a, a], [], key);
    expect(r.fresh.length).toBe(2);
  });
  it("two identical rows when one was saved before: one is a repeat, one is new", () => {
    const r = splitDuplicates([a, a], [a], key);
    expect(r.fresh.length).toBe(1);
    expect(r.duplicates.length).toBe(1);
  });
});

describe("importSales saves each uploaded row once (demo store)", () => {
  const csv = "date,item_name,quantity\n2026-08-10,Sugar,2\n2026-08-11,Sugar,2\n2026-08-12,Sugar,2\n";
  it("the same file twice: 3 rows saved, then 0 saved and 3 skipped; sales do not double", async () => {
    const { rows } = parseSalesCsv(csv);
    const first = await demoStore.importSales(rows);
    expect(first).toMatchObject({ saved: 3, duplicates: 0 });
    const n1 = (await demoStore.listSales("2026-08-01")).filter((s) => s.date >= "2026-08-10" && s.date <= "2026-08-12").length;
    const second = await demoStore.importSales(rows);
    expect(second).toMatchObject({ saved: 0, duplicates: 3 });
    const n2 = (await demoStore.listSales("2026-08-01")).filter((s) => s.date >= "2026-08-10" && s.date <= "2026-08-12").length;
    expect(n2).toBe(n1);
  });
  it("sales that were not uploaded from a file (the demo's own history) never make an upload look like a repeat", async () => {
    const [item] = await demoStore.listItems();
    const r = await demoStore.importSales([{ date: "2026-01-05", itemName: item.name, qty: 4, line: 2 }]);
    expect(r.saved).toBe(1);
  });
});
