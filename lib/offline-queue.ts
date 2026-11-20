// FR1: sales made while offline are kept on the phone and sent when the network returns.
// The rule that matters: every saved sale is recorded exactly ONCE, even if two pages or two senders try at the same moment
// (for example the page reloads just as the network comes back).
// How: each sale carries the moment it was tapped (`ts`). The server treats the same person + item + moment as the same sale
// (see addSale), so a second send of the same sale changes nothing. On top of that, only one sender at a time works through
// the queue where the browser allows it. Pure functions over a small storage, so they can be tested.

export interface Pending { itemId: string; qty: number; id?: string; ts?: number }
export interface QueueStorage { read(): Pending[]; write(q: Pending[]): void }

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

let lastTs = 0;
/** The moment of a tap, in milliseconds. Never the same twice, so two taps are always two different sales. */
export function tapTime(now: number = Date.now()): number {
  lastTs = Math.max(now, lastTs + 1);
  return lastTs;
}

/** The queue, with an id and a tap time on every entry (sales saved by an older version have none). */
function load(st: QueueStorage): Pending[] {
  const q = st.read();
  if (q.some((p) => !p.id || !p.ts)) { const fixed = q.map((p) => ({ ...p, id: p.id ?? newId(), ts: p.ts ?? tapTime() })); st.write(fixed); return fixed; }
  return q;
}

/** Keep a sale on the phone. Returns how many are waiting. */
export function enqueue(st: QueueStorage, p: { itemId: string; qty: number }, now: number = Date.now()): number {
  const q = [...load(st), { ...p, id: newId(), ts: tapTime(now) }];
  st.write(q);
  return q.length;
}

export function waiting(st: QueueStorage): number { return st.read().length; }

const finish = (st: QueueStorage, id: string) => st.write(st.read().filter((p) => p.id !== id));

/** Only one sender at a time across all pages of the app, where the browser supports it. */
export function browserLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  return locks ? (locks.request("stocksaathi-sales-queue", fn) as Promise<T>) : fn();
}

/**
 * Send every waiting sale. A sale that was sent is removed; one that fails stays for the next try (never lost).
 * `send` must throw when the sale was not saved, and must pass `ts` on so the server can recognise a repeat.
 */
export async function flushQueue(
  st: QueueStorage,
  send: (p: Pending) => Promise<void>,
  opts: { lock?: <T>(fn: () => Promise<T>) => Promise<T> } = {},
): Promise<void> {
  const lock = opts.lock ?? browserLock;
  await lock(async () => {
    for (const p of load(st)) {
      try { await send(p); finish(st, p.id!); } catch { /* stays in the queue */ }
    }
  });
}
