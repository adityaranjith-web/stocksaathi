// FR1: sales made while offline are kept on the phone and sent when the network returns.
// The rule that matters: every saved sale is sent exactly ONCE, even if two pages or two senders try at the same moment
// (for example the page reloads just as the network comes back). Pure functions over a small storage, so they can be tested.

export interface Pending { itemId: string; qty: number; id?: string; claimedAt?: number }
export interface QueueStorage { read(): Pending[]; write(q: Pending[]): void }

/** A sale that one sender has taken is left alone for this long. After that (the page was closed mid-send) it is tried again. */
export const CLAIM_MS = 30_000;

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** The queue, with an id on every entry (sales saved by an older version have none). */
function load(st: QueueStorage): Pending[] {
  const q = st.read();
  if (q.some((p) => !p.id)) { const fixed = q.map((p) => (p.id ? p : { ...p, id: newId() })); st.write(fixed); return fixed; }
  return q;
}

/** Keep a sale on the phone. Returns how many are waiting. */
export function enqueue(st: QueueStorage, p: { itemId: string; qty: number }): number {
  const q = [...load(st), { ...p, id: newId() }];
  st.write(q);
  return q.length;
}

export function waiting(st: QueueStorage): number { return st.read().length; }

/** Take the next sale nobody else is sending. Marks it as taken right away. */
function claimNext(st: QueueStorage, now: number, skip: Set<string>): Pending | null {
  const q = load(st);
  const i = q.findIndex((p) => !skip.has(p.id!) && (!p.claimedAt || now - p.claimedAt > CLAIM_MS));
  if (i < 0) return null;
  const taken = { ...q[i], claimedAt: now };
  st.write(q.map((p, k) => (k === i ? taken : p)));
  return taken;
}
const finish = (st: QueueStorage, id: string) => st.write(st.read().filter((p) => p.id !== id));
const release = (st: QueueStorage, id: string) => st.write(st.read().map((p) => (p.id === id ? { id: p.id, itemId: p.itemId, qty: p.qty } : p)));

/** Only one sender at a time across all pages of the app, where the browser supports it. */
export function browserLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  return locks ? (locks.request("stocksaathi-sales-queue", fn) as Promise<T>) : fn();
}

/**
 * Send every waiting sale once. A sale that fails stays in the queue for the next try; it is never lost and never sent twice.
 * `send` must throw when the sale was not saved.
 */
export async function flushQueue(
  st: QueueStorage,
  send: (p: Pending) => Promise<void>,
  opts: { now?: () => number; lock?: <T>(fn: () => Promise<T>) => Promise<T> } = {},
): Promise<void> {
  const now = opts.now ?? Date.now;
  const lock = opts.lock ?? browserLock;
  await lock(async () => {
    const tried = new Set<string>();
    for (;;) {
      const next = claimNext(st, now(), tried);
      if (!next) break;
      tried.add(next.id!);
      try { await send(next); finish(st, next.id!); } catch { release(st, next.id!); }
    }
  });
}
