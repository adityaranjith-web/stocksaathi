import type { Metadata } from "next";
import LegalDoc from "@/components/LegalDoc";
import { CONTACT_EMAIL, LEGAL_UPDATED, TERMS_INTRO, TERMS_SECTIONS, TERMS_TITLE } from "@/lib/legal";

export const metadata: Metadata = { title: TERMS_TITLE, description: "The rules for using StockSaathi." };

// Public page: no sign-in, no shop data (see lib/open-paths.ts).
export default function TermsPage() {
  const sections = TERMS_SECTIONS.map((s) => ({
    heading: s.heading,
    paragraphs: s.paragraphs.map((p) => (p.startsWith("Write to us at ") ? <>Write to us at <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></> : p)),
  }));
  return <LegalDoc title={TERMS_TITLE} updated={LEGAL_UPDATED} intro={TERMS_INTRO} sections={sections} />;
}
