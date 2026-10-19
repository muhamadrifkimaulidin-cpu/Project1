import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "3Rally",
  description: "Pencatatan modal, pengeluaran, dan persetujuan owner 3Rally",
  appleWebApp: { capable: true, title: "3Rally", statusBarStyle: "black" },
  // Next merender appleWebApp.capable sebagai mobile-web-app-capable; iPhone lama butuh tag ini
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

/**
 * Deploy Preview Vercel memakai database UJI (variabel Supabase environment Preview), Production memakai
 * database asli. Pita ini mencegah catatan sungguhan masuk ke database uji karena salah buka alamat.
 */
function PitaModeUji() {
  if (process.env.VERCEL_ENV !== "preview") return null;
  let proyek = "?";
  try {
    proyek = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.split(".")[0];
  } catch {}
  return (
    <div className="pita-uji" role="status">
      MODE UJI · database {proyek} · catatan di sini bukan data asli
    </div>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${inter.variable} ${interTight.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <PitaModeUji />
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem storageKey="kj_theme">
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
