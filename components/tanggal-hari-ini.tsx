"use client";

import { tanggal } from "@/lib/format";
import { useEffect, useState } from "react";

/** Tanggal hari ini menurut jam HP (WIB), bukan jam server Vercel (UTC). */
export function TanggalHariIni() {
  const [teks, setTeks] = useState("");
  useEffect(() => setTeks(tanggal(new Date())), []);
  return <span className="no-lower">{teks}</span>;
}
