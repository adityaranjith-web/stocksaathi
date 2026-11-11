import type { ImportRow } from "@/lib/data/types";

/** FR2: parses the 3-column sales CSV. Bad rows are reported, never silently dropped. */
export function parseSalesCsv(text: string): { rows: ImportRow[]; errors: { line: number; issue: string }[] } {
  const rows: ImportRow[] = [];
  const errors: { line: number; issue: string }[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  lines.forEach((raw, idx) => {
    const line = idx + 1;
    if (!raw.trim()) return;
    const parts = raw.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    if (line === 1 && /date/i.test(parts[0])) return; // header
    if (parts.length < 3) { errors.push({ line, issue: "Needs 3 columns: date, item_name, quantity" }); return; }
    const [date, itemName, q] = [parts[0], parts.slice(1, -1).join(","), parts[parts.length - 1]];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) { errors.push({ line, issue: `Date must be YYYY-MM-DD: "${date}"` }); return; }
    const qty = Number(q);
    if (!Number.isInteger(qty) || qty < 1) { errors.push({ line, issue: `Quantity must be a whole number above 0: "${q}"` }); return; }
    rows.push({ date, itemName, qty, line });
  });
  return { rows, errors };
}
