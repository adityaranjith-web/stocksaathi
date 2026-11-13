import Link from "next/link";
import type { ReactNode } from "react";
import Glass from "@/components/ui/Glass";
import DotIcon from "@/components/ui/DotIcon";
import { DotLabel } from "@/components/ui/DotText";

// A public page of plain text (Privacy Policy, Terms of Service). It needs no sign-in and reads no shop data.
// Each section is a heading and a list of short paragraphs.
export interface LegalSection { heading: string; paragraphs: ReactNode[] }

export default function LegalDoc({ title, updated, intro, sections }: { title: string; updated: string; intro?: ReactNode; sections: LegalSection[] }) {
  return (
    <article className="space-y-4">
      <Link href="/" className="rise inline-flex min-h-[48px] items-center gap-1 text-sm font-semibold"><DotIcon name="back" size={20} />Back to StockSaathi</Link>
      <div className="rise px-1" style={{ "--d": 1 } as React.CSSProperties}>
        <h1 className="text-2xl font-bold leading-tight">{title}</h1>
        <p className="text-sm text-ink-2">Last updated: {updated}</p>
        {intro && <p className="mt-2 text-sm">{intro}</p>}
      </div>
      {sections.map((s, i) => (
        <Glass as="section" key={s.heading} blur={false} delay={Math.min(i + 2, 8)} className="space-y-2 p-4 text-sm">
          <h2><DotLabel>{s.heading}</DotLabel></h2>
          {s.paragraphs.map((p, k) => <p key={k}>{p}</p>)}
        </Glass>
      ))}
      <p className="px-1 text-xs text-ink-2"><Link href="/privacy" className="underline">Privacy policy</Link> · <Link href="/terms" className="underline">Terms</Link></p>
    </article>
  );
}
