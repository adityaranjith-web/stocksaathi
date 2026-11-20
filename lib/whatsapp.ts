// The WhatsApp link for an order (FR7). Pure functions, so they are easy to test.

/**
 * The digits to put in the link, or null when the saved number is not a real one.
 * A masked placeholder such as "+91 98XXX XX318" is not real. A 10-digit Indian number gets 91 in front,
 * because WhatsApp needs the country code. A leading 0 is dropped.
 */
export function whatsappDigits(number: string | null | undefined): string | null {
  if (!number || /x/i.test(number)) return null;
  let d = number.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) return "91" + d;
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}

/** The link. With no real number WhatsApp still opens with the text, and the owner picks the contact. */
export function waLink(number: string | null | undefined, text: string): string {
  return `https://wa.me/${whatsappDigits(number) ?? ""}?text=${encodeURIComponent(text)}`;
}
