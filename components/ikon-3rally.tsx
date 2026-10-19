import { MODE_UJI } from "@/lib/mode";

// Ikon aplikasi (PWA, apple-touch-icon): blok hitam, "3R" + tanda ’ hijau ala logo WWTP.
// Area aman maskable: isi berada di 60% tengah. Versi uji (deploy Preview): blok kuning.
export function Ikon3Rally({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: MODE_UJI ? "#F2B53A" : "#000000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: MODE_UJI ? "#1a1200" : "#E8EDEA",
        fontSize: size * 0.36,
        fontWeight: 800,
        letterSpacing: -size * 0.012,
      }}
    >
      3R<span style={{ color: MODE_UJI ? "#1a1200" : "#3FDC6A" }}>’</span>
    </div>
  );
}
