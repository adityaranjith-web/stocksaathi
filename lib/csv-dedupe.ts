// FR2: uploading the same sales file twice must not count every sale twice.
// A row is a repeat when the same item, date and quantity were already saved by an earlier upload.
// Rows are counted, so a file that really has two identical rows is not mistaken for a repeat of itself.

export function splitDuplicates<T>(rows: T[], saved: T[], key: (x: T) => string): { fresh: T[]; duplicates: T[] } {
  const left = new Map<string, number>();
  for (const s of saved) left.set(key(s), (left.get(key(s)) ?? 0) + 1);
  const fresh: T[] = [], duplicates: T[] = [];
  for (const r of rows) {
    const k = key(r), n = left.get(k) ?? 0;
    if (n > 0) { left.set(k, n - 1); duplicates.push(r); } else fresh.push(r);
  }
  return { fresh, duplicates };
}
