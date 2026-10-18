"use client";

import { InputUang } from "@/components/input-uang";
import { useOnline } from "@/components/status-sinyal";
import { rupiah } from "@/lib/format";
import type { Bahan } from "@/lib/rnd";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const SATUAN = ["gram", "ml", "pcs"] as const;
type Satuan = (typeof SATUAN)[number];

/** Harga per satuan untuk tampilan: Rp30/gram, Rp1.500/pcs */
export function hargaSatuan(harga: number, satuan: string) {
  const teks = harga < 100 ? harga.toLocaleString("id-ID", { maximumFractionDigits: 2 }) : Math.round(harga).toLocaleString("id-ID");
  return `Rp${teks}/${satuan}`;
}

function IsiBahan({ harga, setHarga, isi, setIsi, satuan, setSatuan, idPrefix }: {
  harga: number | null; setHarga: (v: number | null) => void;
  isi: string; setIsi: (v: string) => void;
  satuan: Satuan; setSatuan: (v: Satuan) => void;
  idPrefix: string;
}) {
  return (
    <>
      <div className="fld">
        <label htmlFor={`${idPrefix}-harga`}>Harga beli</label>
        <InputUang id={`${idPrefix}-harga`} nilai={harga} onChange={setHarga} />
      </div>
      <div className="grid">
        <div className="fld">
          <label htmlFor={`${idPrefix}-isi`}>Untuk isi</label>
          <input id={`${idPrefix}-isi`} type="text" inputMode="decimal" value={isi} onChange={(e) => setIsi(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="1000" />
        </div>
        <div className="fld">
          <label>Satuan</label>
          <select value={satuan} onChange={(e) => setSatuan(e.target.value as Satuan)} aria-label="Satuan">
            {SATUAN.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}

const angka = (s: string) => Number(s.replace(",", "."));

export function FormBahan() {
  const router = useRouter();
  const online = useOnline();
  const [nama, setNama] = useState("");
  const [harga, setHarga] = useState<number | null>(null);
  const [isi, setIsi] = useState("1000");
  const [satuan, setSatuan] = useState<Satuan>("gram");
  const [proses, setProses] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const simpan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!online) return setError("Tidak ada sinyal.");
    if (!nama.trim()) return setError("Isi nama bahan.");
    if (harga === null) return setError("Isi harga beli.");
    if (!(angka(isi) > 0)) return setError("Isi jumlah isi lebih dari 0.");
    setProses(true);
    const { error: err } = await createClient()
      .from("rnd_bahan")
      .insert({ nama: nama.trim(), satuan, harga_beli: harga, isi: angka(isi) });
    setProses(false);
    if (err) return setError(err.code === "23505" ? "Nama bahan sudah ada." : err.message);
    setNama("");
    setHarga(null);
    router.refresh();
  };

  return (
    <form className="fs" onSubmit={simpan} noValidate>
      <div className="fs-head">
        <span className="slug">bahan-baru/</span>
        <span className="hint">mis. Rp30.000 untuk 1000 gram</span>
      </div>
      <div className="fs-body form-1">
        <div className="fld">
          <label htmlFor="nama-bahan">Nama bahan</label>
          <input id="nama-bahan" type="text" value={nama} onChange={(e) => setNama(e.target.value)} placeholder="mis. Jeruk peras" />
        </div>
        <IsiBahan harga={harga} setHarga={setHarga} isi={isi} setIsi={setIsi} satuan={satuan} setSatuan={setSatuan} idPrefix="baru" />
        {harga !== null && angka(isi) > 0 && <p className="ref">= {hargaSatuan(harga / angka(isi), satuan)}</p>}
        {error && <p className="err">{error}</p>}
        <button type="submit" className="btn-go" disabled={proses || !online}>
          <span>{proses ? "Menyimpan…" : "Tambah bahan"}</span>
          <span className="arr">+</span>
        </button>
      </div>
    </form>
  );
}

/** Satu baris bahan: lihat harga, ubah harga, aktif/nonaktif. */
export function BarisBahan({ b }: { b: Bahan }) {
  const router = useRouter();
  const online = useOnline();
  const [ubah, setUbah] = useState(false);
  const [harga, setHarga] = useState<number | null>(b.harga_beli);
  const [isi, setIsi] = useState(String(b.isi));
  const [satuan, setSatuan] = useState<Satuan>(b.satuan);
  const [proses, setProses] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kirim = async (perubahan: Record<string, unknown>) => {
    setProses(true);
    setError(null);
    const { error: err } = await createClient().from("rnd_bahan").update(perubahan).eq("id", b.id);
    setProses(false);
    if (err) return setError(err.message);
    setUbah(false);
    router.refresh();
  };

  return (
    <article className={`card bahan${b.aktif ? "" : " card-off"}`}>
      <div className="card-h">
        <div className="card-t">
          {b.nama}
          <small>
            {rupiah(b.harga_beli)} / {Number(b.isi).toLocaleString("id-ID")} {b.satuan}
            {!b.aktif && " · nonaktif"}
          </small>
        </div>
        <span className="card-rp">{hargaSatuan(b.harga_per_satuan, b.satuan)}</span>
      </div>
      {ubah ? (
        <div className="form-1">
          <IsiBahan harga={harga} setHarga={setHarga} isi={isi} setIsi={setIsi} satuan={satuan} setSatuan={setSatuan} idPrefix={b.id} />
          <p className="ref">Uji yang sudah dicatat tetap memakai harga lama (dibekukan); hanya &quot;biaya kini&quot; yang ikut berubah.</p>
          {error && <p className="err">{error}</p>}
          <div className="card-actions">
            <button type="button" className="btn-line" onClick={() => setUbah(false)} disabled={proses}>batal/</button>
            <button
              type="button"
              className="btn-go"
              disabled={proses || !online || harga === null || !(angka(isi) > 0)}
              onClick={() => kirim({ harga_beli: harga, isi: angka(isi), satuan })}
            >
              <span>{proses ? "Menyimpan…" : "Simpan harga"}</span>
              <span className="arr">✓</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="card-actions">
          <button type="button" className="btn-line" onClick={() => kirim({ aktif: !b.aktif })} disabled={proses || !online}>
            {b.aktif ? "nonaktifkan/" : "aktifkan/"}
          </button>
          {b.aktif && (
            <button type="button" className="btn-line" onClick={() => setUbah(true)}>ubah-harga/</button>
          )}
        </div>
      )}
    </article>
  );
}
