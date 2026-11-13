import type { Metadata } from "next";
import LegalDoc from "@/components/LegalDoc";
import { CONTACT_EMAIL, GOOGLE_USER_DATA_POLICY_URL, LEGAL_UPDATED, PRIVACY_INTRO, PRIVACY_SECTIONS, PRIVACY_TITLE } from "@/lib/legal";

export const metadata: Metadata = { title: PRIVACY_TITLE, description: "What StockSaathi collects, why, and your rights." };

// Public page: no sign-in, no shop data. Google needs this address to publish the sign-in app (see lib/open-paths.ts).
export default function PrivacyPage() {
  const sections = PRIVACY_SECTIONS.map((s) => ({
    heading: s.heading,
    paragraphs: s.paragraphs.map((p) => {
      if (p.startsWith("Contact: ")) return <>Contact: <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></>;
      if (p.includes("Google API Services User Data Policy")) {
        const [before, after] = p.split("Google API Services User Data Policy");
        return <>{before}<a className="underline" href={GOOGLE_USER_DATA_POLICY_URL} rel="noopener noreferrer">Google API Services User Data Policy</a>{after}</>;
      }
      return p;
    }),
  }));
  return <LegalDoc title={PRIVACY_TITLE} updated={LEGAL_UPDATED} intro={PRIVACY_INTRO} sections={sections} />;
}
