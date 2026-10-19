import { MODE_UJI, NAMA_APLIKASI } from "@/lib/mode";
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // versi uji terpasang sebagai aplikasi terpisah di HP: nama & warna beda supaya tidak tertukar
    name: NAMA_APLIKASI,
    short_name: NAMA_APLIKASI,
    description: "Pencatatan modal, pengeluaran, dan persetujuan owner 3Rally",
    start_url: "/beranda",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#E8ECE9",
    theme_color: MODE_UJI ? "#F2B53A" : "#000000",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
