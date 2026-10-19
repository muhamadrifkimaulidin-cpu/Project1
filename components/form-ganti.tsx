"use client";

import { InputUang } from "@/components/input-uang";
import { PilihFoto } from "@/components/pilih-foto";
import { useOnline } from "@/components/status-sinyal";
import { unggahBukti } from "@/lib/foto";
import { hariIniLokal, rupiah } from "@/lib/format";
import type { InfoGanti } from "@/lib/riwayat";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Metode = "tunai" | "qris" | "transfer";

/**
 * Ganti ke owner yang membayar duluan (migrasi 007): modal pindah dari pembayar ke pengganti.
 * - Saya bukan pembayar  -> "saya sudah ganti ke <pembayar>", disetujui pembayar.
 * - Saya pembayar        -> "<owner> sudah ganti ke saya", disetujui owner itu.
 */
export function FormGanti({
  tabel,
  belanjaId,
  info,
  userId,
  owner,
}: {
  tabel: "transaksi" | "aset";
  belanjaId: string;
  info: InfoGanti;
  userId: string;
  owner: { id: string; nama: string }[];
}) {
  const router = useRouter();
  const online = useOnline();
  const sayaPembayar = info.pembayarId === userId;
  const lainnya = owner.filter((o) => o.id !== info.pembayarId);

  const [buka, setBuka] = useState(false);
  const [pengganti, setPengganti] = useState(sayaPembayar ? "" : userId);
  const [jumlah, setJumlah] = useState<number | null>(null);
  const [metode, setMetode] = useState<Metode>("transfer");
  const [keterangan, setKeterangan] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [proses, setProses] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selesai, setSelesai] = useState<string | null>(null);
  // id stabil: simpan ulang setelah sinyal putus tidak menggandakan
  const idGanti = useRef<string | null>(null);

  if (info.sisa <= 0) return null;
  const rata = Math.round(info.total / Math.max(owner.length, 1));
  const lawan = sayaPembayar ? owner.find((o) => o.id === pengganti)?.nama ?? "owner itu" : info.pembayar;

  const simpan = async () => {
    setError(null);
    if (!online) return setError("Tidak ada sinyal. Tidak ada yang disimpan — coba lagi setelah tersambung.");
    if (!pengganti) return setError("Pilih siapa yang mengganti.");
    if (!jumlah || jumlah <= 0) return setError("Isi jumlah lebih dari Rp0.");
    if (jumlah > info.sisa) return setError(`Maksimal ${rupiah(info.sisa)} (sisa yang belum diganti).`);
    const tgl = hariIniLokal();
    const supabase = createClient();
    idGanti.current ??= crypto.randomUUID();
    try {
      const buktiPath = foto ? await unggahBukti(supabase, "ganti", tgl, idGanti.current, foto, setProses) : null;
      setProses("Menyimpan…");
      const { error: err } = await supabase.from("ganti_modal").insert({
        id: idGanti.current,
        tanggal: tgl,
        penerima_id: info.pembayarId,
        pengganti_id: pengganti,
        jumlah,
        metode,
        keterangan: keterangan.trim() || null,
        bukti_path: buktiPath,
        ...(tabel === "transaksi" ? { transaksi_id: belanjaId } : { aset_id: belanjaId }),
      });
      if (err && err.code !== "23505") throw new Error(err.message);
      setSelesai(`Tercatat ${rupiah(jumlah)} — menunggu persetujuan ${lawan}. Porsi bergeser setelah disetujui.`);
      setBuka(false);
      router.refresh();
    } catch (x) {
      setError(x instanceof Error ? x.message : "Gagal menyimpan.");
    } finally {
      setProses(null);
    }
  };

  if (selesai) return <p className="notice ganti-pesan">{selesai}</p>;

  if (!buka) {
    return (
      <div className="card-actions">
        <button type="button" className="btn-line" onClick={() => setBuka(true)}>
          {sayaPembayar ? "catat-ganti-diterima/" : `ganti-ke-${info.pembayar.toLowerCase()}/`}
        </button>
      </div>
    );
  }

  return (
    <div className="ganti-form">
      <p className="ref">
        {sayaPembayar
          ? "Catat owner yang sudah mengganti uangmu untuk belanja ini. Owner itu yang menyetujui."
          : `Catat uang yang kamu ganti ke ${info.pembayar}. ${info.pembayar} yang menyetujui setelah uangnya diterima.`}{" "}
        Modal pindah ke yang mengganti; kas usaha tidak berubah.
      </p>
      {sayaPembayar && (
        <div className="fld">
          <label htmlFor={`pengganti-${belanjaId}`}>Yang mengganti</label>
          <select id={`pengganti-${belanjaId}`} value={pengganti} onChange={(e) => setPengganti(e.target.value)}>
            <option value="">Pilih owner…</option>
            {lainnya.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nama}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="fld">
        <label htmlFor={`jumlah-ganti-${belanjaId}`}>Jumlah diganti</label>
        <InputUang id={`jumlah-ganti-${belanjaId}`} nilai={jumlah} onChange={setJumlah} />
        <div className="chips">
          {rata <= info.sisa && (
            <button type="button" className="chip" onClick={() => setJumlah(rata)}>
              bagi rata {rupiah(rata)}
            </button>
          )}
          <button type="button" className="chip" onClick={() => setJumlah(info.sisa)}>
            sisa {rupiah(info.sisa)}
          </button>
        </div>
      </div>
      <div className="fld">
        <label>Metode</label>
        <div className="seg seg-wide" role="radiogroup" aria-label="Metode">
          {(["transfer", "tunai", "qris"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={metode === m}
              className={metode === m ? "active" : undefined}
              onClick={() => setMetode(m)}
            >
              {m === "qris" ? "QRIS" : m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="fld">
        <label>Foto bukti transfer (disarankan)</label>
        <PilihFoto file={foto} onChange={setFoto} />
      </div>
      <div className="fld">
        <label htmlFor={`ket-ganti-${belanjaId}`}>Keterangan (opsional)</label>
        <input id={`ket-ganti-${belanjaId}`} type="text" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
      </div>
      <p className="err" role="alert">
        {error}
      </p>
      <div className="card-actions">
        <button type="button" className="btn-line" onClick={() => setBuka(false)} disabled={!!proses}>
          kembali/
        </button>
        <button type="button" className="btn-go" onClick={simpan} disabled={!!proses || !online}>
          <span>{proses ?? (online ? "Simpan ganti" : "Tidak ada sinyal")}</span>
          <span className="arr">↗</span>
        </button>
      </div>
    </div>
  );
}
