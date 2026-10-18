"use client";

import { useRouter } from "next/navigation";

type Opsi = { id: string; nama: string };

/** Pilihan owner & kategori: langsung pindah URL saat diganti (filter lain dipertahankan). */
export function PilihFilter({
  kunci,
  nilai,
  semua,
  opsi,
  query,
}: {
  kunci: "owner" | "kategori";
  nilai: string | null;
  semua: string;
  opsi: Opsi[];
  query: Record<string, string>;
}) {
  const router = useRouter();
  return (
    <select
      aria-label={kunci}
      value={nilai ?? ""}
      onChange={(e) => {
        const q = new URLSearchParams(query);
        if (e.target.value) q.set(kunci, e.target.value);
        else q.delete(kunci);
        const s = q.toString();
        router.push(`/riwayat${s ? `?${s}` : ""}`);
      }}
    >
      <option value="">{semua}</option>
      {opsi.map((o) => (
        <option key={o.id} value={o.id}>
          {o.nama}
        </option>
      ))}
    </select>
  );
}
