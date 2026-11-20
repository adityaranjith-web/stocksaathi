import { describe, expect, it } from "vitest";
import { CLAIM_MS, enqueue, flushQueue, waiting, type Pending, type QueueStorage } from "./offline-queue";

/** A phone's storage that two pages (or two senders) share. */
function memory(initial: Pending[] = []): QueueStorage & { data: Pending[] } {
  const s = { data: initial.slice(), read: () => s.data.map((p) => ({ ...p })), write: (q: Pending[]) => { s.data = q.map((p) => ({ ...p })); } };
  return s;
}
const later = () => new Promise<void>((r) => setTimeout(r, 5));
const noLock = <T,>(fn: () => Promise<T>) => fn(); // two senders with no lock at all: the worst case
function mutex() { let tail: Promise<unknown> = Promise.resolve(); return <T,>(fn: () => Promise<T>): Promise<T> => { const run = tail.then(fn, fn); tail = run.catch(() => {}); return run; }; }

describe("sales saved on the phone while offline (FR1)", () => {
  it("3 offline sales, then two senders start at the same moment (the page reloads as the network returns): each sale is sent once", async () => {
    const st = memory();
    for (const itemId of ["a", "b", "c"]) enqueue(st, { itemId, qty: 1 });
    const sent: string[] = [];
    const send = async (p: Pending) => { await later(); sent.push(p.itemId); };
    await Promise.all([flushQueue(st, send, { lock: noLock }), flushQueue(st, send, { lock: noLock })]);
    expect(sent.sort()).toEqual(["a", "b", "c"]); // not 4, not 6
    expect(waiting(st)).toBe(0);
  });
  it("the same with one sender at a time (the browser lock): each sale once", async () => {
    const st = memory();
    for (const itemId of ["a", "b", "c"]) enqueue(st, { itemId, qty: 2 });
    const sent: string[] = [];
    const lock = mutex();
    const send = async (p: Pending) => { await later(); sent.push(p.itemId); };
    await Promise.all([flushQueue(st, send, { lock }), flushQueue(st, send, { lock }), flushQueue(st, send, { lock })]);
    expect(sent.sort()).toEqual(["a", "b", "c"]);
    expect(waiting(st)).toBe(0);
  });
  it("a sale that could not be sent stays on the phone (not lost) and goes on the next try", async () => {
    const st = memory();
    enqueue(st, { itemId: "a", qty: 1 });
    await flushQueue(st, async () => { throw new Error("no network"); }, { lock: noLock });
    expect(waiting(st)).toBe(1);
    expect(st.data[0].claimedAt).toBeUndefined(); // released
    const sent: string[] = [];
    await flushQueue(st, async (p) => { sent.push(p.itemId); }, { lock: noLock });
    expect(sent).toEqual(["a"]);
    expect(waiting(st)).toBe(0);
  });
  it("one failed sale does not stop the others, and is not tried over and over in the same round", async () => {
    const st = memory();
    for (const itemId of ["a", "b", "c"]) enqueue(st, { itemId, qty: 1 });
    const tries: string[] = [];
    await flushQueue(st, async (p) => { tries.push(p.itemId); if (p.itemId === "b") throw new Error("x"); }, { lock: noLock });
    expect(tries).toEqual(["a", "b", "c"]);
    expect(st.data.map((p) => p.itemId)).toEqual(["b"]);
  });
  it("a sale another page is sending right now is left alone", async () => {
    const t0 = 1_000_000;
    const st = memory([{ itemId: "a", qty: 1, id: "1", claimedAt: t0 }]);
    const sent: string[] = [];
    await flushQueue(st, async (p) => { sent.push(p.itemId); }, { lock: noLock, now: () => t0 + 1000 });
    expect(sent).toEqual([]);
    expect(waiting(st)).toBe(1);
  });
  it("a sale taken by a page that was closed mid-send is sent again after the wait", async () => {
    const t0 = 1_000_000;
    const st = memory([{ itemId: "a", qty: 1, id: "1", claimedAt: t0 }]);
    const sent: string[] = [];
    await flushQueue(st, async (p) => { sent.push(p.itemId); }, { lock: noLock, now: () => t0 + CLAIM_MS + 1 });
    expect(sent).toEqual(["a"]);
    expect(waiting(st)).toBe(0);
  });
  it("sales saved by an older version (no id) are still sent, once", async () => {
    const st = memory([{ itemId: "a", qty: 1 }, { itemId: "b", qty: 3 }]);
    const sent: string[] = [];
    await Promise.all([flushQueue(st, async (p) => { await later(); sent.push(p.itemId + p.qty); }, { lock: noLock }), flushQueue(st, async (p) => { await later(); sent.push(p.itemId + p.qty); }, { lock: noLock })]);
    expect(sent.sort()).toEqual(["a1", "b3"]);
  });
  it("enqueue keeps each sale and says how many are waiting", () => {
    const st = memory();
    expect(enqueue(st, { itemId: "a", qty: 1 })).toBe(1);
    expect(enqueue(st, { itemId: "a", qty: 1 })).toBe(2); // two taps are two sales
    expect(new Set(st.data.map((p) => p.id)).size).toBe(2);
  });
});
