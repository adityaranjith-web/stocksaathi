import { describe, expect, it } from "vitest";
import { enqueue, flushQueue, tapTime, waiting, type Pending, type QueueStorage } from "./offline-queue";

/** A phone's storage that two pages (or two senders) share. */
function memory(initial: Pending[] = []): QueueStorage & { data: Pending[] } {
  const s = { data: initial.slice(), read: () => s.data.map((p) => ({ ...p })), write: (q: Pending[]) => { s.data = q.map((p) => ({ ...p })); } };
  return s;
}
/** The server: the same item + tap moment is recorded once (what addSale does). */
function server() {
  const saved = new Map<string, number>(); let requests = 0;
  return {
    get saved() { return [...saved.values()]; }, get requests() { return requests; },
    send: async (p: Pending) => { requests++; await new Promise((r) => setTimeout(r, 5)); const key = `${p.itemId}|${p.ts}`; if (!saved.has(key)) saved.set(key, p.qty); },
  };
}
const noLock = <T,>(fn: () => Promise<T>) => fn(); // two senders with no lock at all: the worst case
function mutex() { let tail: Promise<unknown> = Promise.resolve(); return <T,>(fn: () => Promise<T>): Promise<T> => { const run = tail.then(fn, fn); tail = run.catch(() => {}); return run; }; }

describe("sales saved on the phone while offline (FR1): each sale is recorded once", () => {
  it("3 offline sales, then two senders start at the same moment (the page reloads as the network returns): 3 sales recorded, not 4 or 6", async () => {
    const st = memory(); const srv = server();
    for (const itemId of ["a", "b", "c"]) enqueue(st, { itemId, qty: 1 });
    await Promise.all([flushQueue(st, srv.send, { lock: noLock }), flushQueue(st, srv.send, { lock: noLock })]);
    expect(srv.saved.length).toBe(3); // the server ignores the second send of the same sale
    expect(waiting(st)).toBe(0);
  });
  it("with one sender at a time (the browser lock) nothing is even sent twice", async () => {
    const st = memory(); const srv = server(); const lock = mutex();
    for (const itemId of ["a", "b", "c"]) enqueue(st, { itemId, qty: 2 });
    await Promise.all([flushQueue(st, srv.send, { lock }), flushQueue(st, srv.send, { lock }), flushQueue(st, srv.send, { lock })]);
    expect(srv.saved.length).toBe(3);
    expect(srv.requests).toBe(3);
    expect(waiting(st)).toBe(0);
  });
  it("a sale that could not be sent stays on the phone (not lost) and goes on the next try", async () => {
    const st = memory(); const srv = server();
    enqueue(st, { itemId: "a", qty: 1 });
    await flushQueue(st, async () => { throw new Error("no network"); }, { lock: noLock });
    expect(waiting(st)).toBe(1);
    await flushQueue(st, srv.send, { lock: noLock });
    expect(srv.saved.length).toBe(1);
    expect(waiting(st)).toBe(0);
  });
  it("one failed sale does not stop the others", async () => {
    const st = memory(); const srv = server();
    for (const itemId of ["a", "b", "c"]) enqueue(st, { itemId, qty: 1 });
    await flushQueue(st, async (p) => { if (p.itemId === "b") throw new Error("x"); await srv.send(p); }, { lock: noLock });
    expect(st.data.map((p) => p.itemId)).toEqual(["b"]);
    expect(srv.saved.length).toBe(2);
  });
  it("a sale that was saved by the server but whose answer never came back is sent again and still counted once", async () => {
    const st = memory(); const srv = server();
    enqueue(st, { itemId: "a", qty: 4 });
    await flushQueue(st, async (p) => { await srv.send(p); throw new Error("page closed before the answer"); }, { lock: noLock });
    expect(waiting(st)).toBe(1); // the phone does not know it was saved
    await flushQueue(st, srv.send, { lock: noLock });
    expect(srv.saved).toEqual([4]); // recorded once
    expect(waiting(st)).toBe(0);
  });
  it("sales saved by an older version (no id, no tap time) are still sent, once", async () => {
    const st = memory([{ itemId: "a", qty: 1 }, { itemId: "b", qty: 3 }]); const srv = server();
    await flushQueue(st, srv.send, { lock: mutex() });
    expect(srv.saved.sort()).toEqual([1, 3]);
    expect(waiting(st)).toBe(0);
  });
  it("two taps are two sales: each gets its own tap time, even in the same millisecond", () => {
    const st = memory();
    expect(enqueue(st, { itemId: "a", qty: 1 }, 5000)).toBe(1);
    expect(enqueue(st, { itemId: "a", qty: 1 }, 5000)).toBe(2);
    expect(new Set(st.data.map((p) => p.ts)).size).toBe(2);
    expect(new Set(st.data.map((p) => p.id)).size).toBe(2);
    expect(tapTime(5000)).toBeGreaterThan(5000);
  });
});
