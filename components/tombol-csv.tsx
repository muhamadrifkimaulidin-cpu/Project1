"use client";

import { hariIniLokal } from "@/lib/format";
import { Download } from "lucide-react";

export type SelCsv = string | number | null;

function sel(v: SelCsv): string {
  if (v === null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Ekspor CSV di browser: koma sebagai pemisah, UTF-8 + BOM (Excel & Google Sheets membaca huruf
 * dengan benar). Angka uang ditulis polos (tanpa "Rp" dan titik ribuan) supaya bisa dijumlah.
 */
export function TombolCsv({ nama, kolom, baris }: { nama: string; kolom: string[]; baris: SelCsv[][] }) {
  const unduh = () => {
    const isi = [kolom, ...baris].map((r) => r.map(sel).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + isi], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `3rally-${nama}-${hariIniLokal()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  return (
    <button type="button" className="btn-line btn-csv" onClick={unduh} disabled={!baris.length}>
      <Download className="ic" /> ekspor-csv/
    </button>
  );
}
