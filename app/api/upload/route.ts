import { getStore } from "@/lib/data";
import { parseSalesCsv } from "@/lib/csv";
import { ownerOnly } from "@/lib/auth";

export async function POST(req: Request) {
  const denied = await ownerOnly();
  if (denied) return denied;
  const text = await req.text();
  if (text.length > 2_000_000) return new Response("File too large (max 2 MB)", { status: 400 });
  const { rows, errors } = parseSalesCsv(text);
  try {
    const result = await getStore().importSales(rows);
    return Response.json({ saved: result.saved, errors: [...errors, ...result.errors].sort((a, b) => a.line - b.line) });
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
