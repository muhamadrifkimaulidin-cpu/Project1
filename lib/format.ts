const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** Rp1.234.567 (tanpa desimal, minus di depan) */
export function rupiah(n: number | string | null | undefined): string {
  const v = Math.round(Number(n ?? 0));
  const s = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (v < 0 ? "-Rp" : "Rp") + s;
}

/** 18 Okt 2026. Terima Date atau string 'YYYY-MM-DD' (dibaca sebagai tanggal lokal, bukan UTC). */
export function tanggal(d: Date | string): string {
  const dt = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
    : new Date(d);
  return `${dt.getDate()} ${BULAN[dt.getMonth()]} ${dt.getFullYear()}`;
}

/** 'YYYY-MM-DD' hari ini menurut jam perangkat (WIB di HP), bukan UTC. Panggil hanya di browser. */
export function hariIniLokal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
