import { describe, expect, it } from "vitest";
import { waLink, whatsappDigits } from "./whatsapp";

describe("the WhatsApp number in the order link (FR7)", () => {
  it("a masked placeholder is not a real number (the demo distributors)", () => {
    expect(whatsappDigits("+91 98XXX XX318")).toBeNull();
    expect(whatsappDigits("+91 94XXX XX201")).toBeNull();
  });
  it("an empty or short number is not a real number", () => {
    expect(whatsappDigits("")).toBeNull();
    expect(whatsappDigits(null)).toBeNull();
    expect(whatsappDigits(undefined)).toBeNull();
    expect(whatsappDigits("12345")).toBeNull();
  });
  it("a 10-digit Indian number gets the country code 91 (WhatsApp needs it)", () => {
    expect(whatsappDigits("9876543210")).toBe("919876543210");
    expect(whatsappDigits("98765 43210")).toBe("919876543210");
    expect(whatsappDigits("09876543210")).toBe("919876543210");
  });
  it("a number that already has the country code is kept as it is", () => {
    expect(whatsappDigits("+91 98765 43210")).toBe("919876543210");
    expect(whatsappDigits("919876543210")).toBe("919876543210");
  });
  it("the link has the number and the encoded order text", () => {
    const text = "Order from Sri Balaji Stores\n1. Curd 400 g x 35";
    expect(waLink("9876543210", text)).toBe(`https://wa.me/919876543210?text=${encodeURIComponent(text)}`);
  });
  it("with no real number the link still carries the text, so the owner can pick the contact", () => {
    expect(waLink("+91 98XXX XX318", "Hello")).toBe("https://wa.me/?text=Hello");
  });
});
