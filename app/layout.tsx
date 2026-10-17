import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Kedai Jus",
  description: "Pencatatan modal, pengeluaran, dan persetujuan owner Kedai Jus",
  appleWebApp: { capable: true, title: "Kedai Jus", statusBarStyle: "black" },
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${inter.variable} ${interTight.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem storageKey="kj_theme">
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
