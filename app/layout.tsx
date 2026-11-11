import type { Metadata, Viewport } from "next";
import { Doto } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import GlassMode from "@/components/ui/GlassMode";
import RoleSwitch from "@/components/RoleSwitch";
import { Badge } from "@/components/ui/Badge";
import { isLive } from "@/lib/data";
import { getMe } from "@/lib/auth";

// Doto: open-source dot-matrix font (SIL Open Font License), loaded from Google Fonts at build time.
const doto = Doto({ subsets: ["latin"], variable: "--font-doto", display: "swap", axes: ["ROND"] });

export const metadata: Metadata = {
  title: "StockSaathi",
  description: "Daily reorder list for kirana stores",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e8edf5" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0e16" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const me = await getMe();
  return (
    <html lang="en" className={doto.variable}>
      <body className="antialiased">
        <div className="mx-auto min-h-screen max-w-md pb-32">
          <header className="px-4 pb-1 pt-4">
            <div className="flex items-center justify-between">
              <span className="dot-label text-lg">StockSaathi</span>
              <div className="flex items-center gap-2">
                {!isLive && <Badge>Demo data</Badge>}
                {isLive && me?.role === "helper" && <Badge>Helper</Badge>}
                <GlassMode />
              </div>
            </div>
            {!isLive && me && <div className="mt-2"><RoleSwitch role={me.role} /></div>}
          </header>
          <main className="px-4 py-3">{children}</main>
        </div>
        <BottomNav role={me?.role ?? null} />
      </body>
    </html>
  );
}
