import { describe, expect, it } from "vitest";
import { orderText, shareAction } from "./share-order";

describe("sharing an order on WhatsApp", () => {
  it("the first tap saves one order; every later tap only opens WhatsApp again (no second order)", () => {
    expect(shareAction(undefined)).toBe("save");
    const sent = { orderId: "PO-1", text: "x" };
    expect(shareAction(sent)).toBe("reopen");
    // tapping 5 more times never asks for a new order
    expect([1, 2, 3, 4, 5].map(() => shareAction(sent))).toEqual(["reopen", "reopen", "reopen", "reopen", "reopen"]);
  });
  it("the message lists the shop, the order number and each line with a quantity", () => {
    const t = orderText("Sri Balaji Stores", "PO-7", [
      { name: "Curd", pack: "400 g", qty: 35 },
      { name: "Paneer", pack: "200 g", qty: 0 },
      { name: "Butter", pack: "100 g", qty: 12 },
    ]);
    expect(t).toBe("Order from Sri Balaji Stores (PO-7)\n1. Curd 400 g x 35\n2. Butter 100 g x 12\nPlease confirm delivery date. Thank you.");
  });
  it("the saved text is reused as it was, so a second share sends the same order", () => {
    const first = orderText("Sri Balaji Stores", "PO-7", [{ name: "Curd", pack: "400 g", qty: 35 }]);
    const sent = { orderId: "PO-7", text: first };
    expect(shareAction(sent)).toBe("reopen");
    expect(sent.text).toBe(first);
  });
});
