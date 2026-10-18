// Ikon aplikasi (PWA, apple-touch-icon): blok hitam, "3R" + tanda ’ hijau ala logo WWTP.
// Area aman maskable: isi berada di 60% tengah.
export function IkonKedai({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: "#000000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#E8EDEA",
        fontSize: size * 0.36,
        fontWeight: 800,
        letterSpacing: -size * 0.012,
      }}
    >
      3R<span style={{ color: "#3FDC6A" }}>’</span>
    </div>
  );
}
