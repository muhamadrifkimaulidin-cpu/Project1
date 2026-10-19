"use client";

import { InputUang } from "@/components/input-uang";
import { rupiah } from "@/lib/format";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Owner = { id: string; nama: string };
export type IsianPatungan = Record<string, number | null>; // owner id -> jumlah (null = tidak diminta)

/** Total yang diminta dari isian. */
export const totalPatungan = (isi: IsianPatungan) => Object.values(isi).reduce<number>((a, v) => a + (v ?? 0), 0);

/**
 * Pilih owner lain yang diminta patungan dan jumlahnya (migrasi 008).
 * "bagi rata" = nilai belanja dibagi semua owner (termasuk saya), untuk tiap owner yang dipilih.
 */
export function PilihPatungan({
  idAwal,
  owner,
  total,
  batas,
  isi,
  onChange,
}: {
  idAwal: string;
  owner: Owner[]; // owner lain yang boleh diminta
  total: number | null; // nilai belanja
  batas: number | null; // maksimal total yang boleh diminta (null = nilai belanja)
  isi: IsianPatungan;
  onChange: (v: IsianPatungan) => void;
}) {
  const rata = total ? Math.round(total / (owner.length + 1)) : 0;
  const jumlah = totalPatungan(isi);
  const maks = batas ?? total ?? 0;

  return (
    <div className="patungan-pilih">
      {owner.map((o) => (
        <div key={o.id} className="fld">
          <label htmlFor={`${idAwal}-${o.id}`}>{o.nama}</label>
          <InputUang id={`${idAwal}-${o.id}`} nilai={isi[o.id] ?? null} onChange={(v) => onChange({ ...isi, [o.id]: v })} />
        </div>
      ))}
      <div className="chips">
        {rata > 0 && rata * owner.length <= maks && (
          <button type="button" className="chip" onClick={() => onChange(Object.fromEntries(owner.map((o) => [o.id, rata])))}>
            bagi rata {owner.length + 1} orang: {rupiah(rata)}/orang
          </button>
        )}
        <button type="button" className="chip" onClick={() => onChange({})}>
          kosongkan
        </button>
      </div>
      <p className={`ref${jumlah > maks ? " warn" : ""}`}>
        Diminta {rupiah(jumlah)}
        {total ? ` dari ${rupiah(total)} · saya tanggung ${rupiah(Math.max(0, total - jumlah))}` : ""}
        {batas !== null && batas < (total ?? 0) ? ` · maksimal ${rupiah(batas)}` : ""}
      </p>
    </div>
  );
}

/**
 * Simpan permintaan patungan. id per owner stabil (dari pemanggil): kirim ulang setelah sinyal putus
 * tidak menggandakan; 23505 (sudah tersimpan / sudah ada tagihan terbuka) dianggap beres.
 */
export async function simpanPatungan(
  supabase: SupabaseClient,
  sumber: Record<string, string>, // { transaksi_id } atau { aset_id }
  penagihId: string,
  isi: IsianPatungan,
  ids: Record<string, string>,
): Promise<void> {
  const baris = Object.entries(isi)
    .filter(([, v]) => v && v > 0)
    .map(([ownerId, jumlah]) => ({ id: ids[ownerId], ...sumber, penagih_id: penagihId, tertagih_id: ownerId, jumlah }));
  for (const b of baris) {
    const { error } = await supabase.from("patungan").insert(b);
    if (error && error.code !== "23505") throw new Error(error.message);
  }
}
