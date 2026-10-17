import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kedai Jus",
    short_name: "Kedai Jus",
    description: "Pencatatan modal, pengeluaran, dan persetujuan owner Kedai Jus",
    start_url: "/beranda",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#E8ECE9",
    theme_color: "#000000",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
