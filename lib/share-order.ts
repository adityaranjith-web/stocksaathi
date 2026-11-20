// Sharing an order on WhatsApp (FR7). Pure functions, so the rules can be tested.

export interface ShareLine { name: string; pack: string; qty: number }
export interface SentOrder { orderId: string; text: string }

/** The message the distributor gets. Only lines with a quantity are listed. */
export function orderText(shopName: string, orderId: string, lines: ShareLine[]): string {
  return [
    `Order from ${shopName} (${orderId})`,
    ...lines.filter((l) => l.qty > 0).map((l, i) => `${i + 1}. ${l.name} ${l.pack} x ${l.qty}`),
    "Please confirm delivery date. Thank you.",
  ].join("\n");
}

/**
 * What a tap on Share does. The first tap saves ONE order. Any later tap on the same list ("share again")
 * only opens WhatsApp again with the saved order, so the same items are never ordered twice.
 */
export function shareAction(sent: SentOrder | undefined): "save" | "reopen" {
  return sent ? "reopen" : "save";
}
