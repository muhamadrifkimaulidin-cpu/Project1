"use client";

import { InputUang } from "@/components/input-uang";
import { PilihFoto } from "@/components/pilih-foto";
import { PilihPatungan, simpanPatungan, totalPatungan, type IsianPatungan, type Owner } from "@/components/pilih-patungan";
import { useOnline } from "@/components/status-sinyal";
import { unggahBukti } from "@/lib/foto";
import { hariIniLokal, rupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Metode = "tunai" | "qris" | "transfer";

/** "transaksi:<id>" -> { transaksi_id } / { aset_id } */
function kolomSumber(kunci: string, awalan = ""): Record<string, string> {
  const [tabel, id] = kunci.split(":");
  return { [`${awalan}${tabel === "aset" ? "aset_id" : "transaksi_id"}`]: id };
}

const TIDAK_ADA_SINYAL = "Tidak ada sinyal. Tidak ada yang disimpan — coba lagi setelah tersambung.";

/**
 * Tagihan patungan untuk saya: bayar (boleh sebagian -> ganti_modal tertaut, disetujui penagih)
 * atau tidak ikut (alasan wajib, boleh menautkan belanja uang pribadi saya yang saya tanggung).
 */
export function AksiTagihan({
  tagihan,
  userId,
  belanjaAktif,
  pilihanTanggung,
}: {
  tagihan: { id: string; kunci: string; penagihId: string; penagih: string; sisa: number; diproses: number };
  userId: string;
  belanjaAktif: boolean;
  pilihanTanggung: { kunci: string; label: string }[];
}) {
  const router = useRouter();
  const online = useOnline();
  const [mode, setMode] = useState<"bayar" | "tolak" | null>(null);
  const [jumlah, setJumlah] = useState<number | null>(tagihan.sisa || null);
  const [metode, setMetode] = useState<Metode>("transfer");
  const [foto, setFoto] = useState<File | null>(null);
  const [keterangan, setKeterangan] = useState("");
  const [alasan, setAlasan] = useState("");
  const [tanggung, setTanggung] = useState("");
  const [proses, setProses] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selesai, setSelesai] = useState<string | null>(null);
  const idGanti = useRef<string | null>(null);

  if (selesai) return <p className="notice ganti-pesan">{selesai}</p>;

  const bayar = async () => {
    setError(null);
    if (!online) return setError(TIDAK_ADA_SINYAL);
    if (!jumlah || jumlah <= 0) return setError("Isi jumlah lebih dari Rp0.");
    if (jumlah > tagihan.sisa) return setError(`Maksimal ${rupiah(tagihan.sisa)} (sisa tagihan).`);
    const tgl = hariIniLokal();
    const supabase = createClient();
    idGanti.current ??= crypto.randomUUID();
    try {
      const buktiPath = foto ? await unggahBukti(supabase, "ganti", tgl, idGanti.current, foto, setProses) : null;
      setProses("Menyimpan…");
      const { error: err } = await supabase.from("ganti_modal").insert({
        id: idGanti.current,
        tanggal: tgl,
        penerima_id: tagihan.penagihId,
        pengganti_id: userId,
        jumlah,
        metode,
        keterangan: keterangan.trim() || null,
        bukti_path: buktiPath,
        patungan_id: tagihan.id,
        ...kolomSumber(tagihan.kunci),
      });
      if (err && err.code !== "23505") throw new Error(err.message);
      setSelesai(`Tercatat ${rupiah(jumlah)} — menunggu ${tagihan.penagih} mengonfirmasi uangnya diterima. Porsi bergeser setelah itu.`);
      router.refresh();
    } catch (x) {
      setError(x instanceof Error ? x.message : "Gagal menyimpan.");
    } finally {
      setProses(null);
    }
  };

  const tolak = async () => {
    setError(null);
    if (!online) return setError(TIDAK_ADA_SINYAL);
    if (!alasan.trim()) return setError("Alasan wajib diisi.");
    setProses("Menyimpan…");
    const supabase = createClient();
    const { error: err } = await supabase
      .from("patungan")
      .update({ status: "ditolak", alasan: alasan.trim(), ...(tanggung ? kolomSumber(tanggung, "tanggung_") : {}) })
      .eq("id", tagihan.id)
      .select("id")
      .single();
    setProses(null);
    if (err) return setError(err.code === "PGRST116" ? "Tagihan sudah berubah. Muat ulang halaman." : err.message);
    setSelesai(`Kamu tidak ikut patungan ini. Sisa ${rupiah(tagihan.sisa)} tetap jadi modal ${tagihan.penagih}.`);
    router.refresh();
  };

  if (!mode) {
    if (!belanjaAktif) return <p className="ref warn">Belanja ini masih menunggu persetujuan — bayar setelah disetujui.</p>;
    return (
      <div className="card-actions">
        {tagihan.sisa > 0 && (
          <button type="button" className="btn-go" onClick={() => setMode("bayar")}>
            <span>Sudah saya transfer</span>
            <span className="arr">↗</span>
          </button>
        )}
        {tagihan.diproses === 0 && (
          <button type="button" className="btn-line" onClick={() => setMode("tolak")}>
            tidak-ikut/
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="ganti-form">
      {mode === "bayar" ? (
        <>
          <p className="ref">
            Catat uang yang sudah kamu kirim ke {tagihan.penagih}. {tagihan.penagih} mengonfirmasi setelah uangnya diterima;
            modal pindah ke kamu, kas usaha tidak berubah.
          </p>
          <div className="fld">
            <label htmlFor={`bayar-${tagihan.id}`}>Jumlah</label>
            <InputUang id={`bayar-${tagihan.id}`} nilai={jumlah} onChange={setJumlah} />
            <div className="chips">
              <button type="button" className="chip" onClick={() => setJumlah(tagihan.sisa)}>
                lunasi {rupiah(tagihan.sisa)}
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
            <label htmlFor={`ket-bayar-${tagihan.id}`}>Keterangan (opsional)</label>
            <input id={`ket-bayar-${tagihan.id}`} type="text" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
          </div>
        </>
      ) : (
        <>
          <p className="ref">
            Sisa tagihan tetap jadi modal {tagihan.penagih}. Bagian yang sudah kamu bayar tidak berubah.
          </p>
          <div className="fld">
            <label htmlFor={`alasan-${tagihan.id}`}>Alasan (wajib)</label>
            <textarea
              id={`alasan-${tagihan.id}`}
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder="mis. saya sudah beli sedotan sendiri"
            />
          </div>
          {pilihanTanggung.length > 0 && (
            <div className="fld">
              <label htmlFor={`tanggung-${tagihan.id}`}>Saya sudah menanggung belanja lain (opsional)</label>
              <select id={`tanggung-${tagihan.id}`} value={tanggung} onChange={(e) => setTanggung(e.target.value)}>
                <option value="">— tidak ada —</option>
                {pilihanTanggung.map((p) => (
                  <option key={p.kunci} value={p.kunci}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p className="ref">Hanya keterangan untuk audit. Modalmu dari belanja itu sudah dihitung sendiri.</p>
            </div>
          )}
        </>
      )}
      <p className="err" role="alert">
        {error}
      </p>
      <div className="card-actions">
        <button type="button" className="btn-line" onClick={() => setMode(null)} disabled={!!proses}>
          kembali/
        </button>
        <button type="button" className="btn-go" onClick={mode === "bayar" ? bayar : tolak} disabled={!!proses || !online}>
          <span>{proses ?? (!online ? "Tidak ada sinyal" : mode === "bayar" ? "Simpan" : "Tidak ikut")}</span>
          <span className="arr">↗</span>
        </button>
      </div>
    </div>
  );
}

/** Satu tagihan yang saya minta: ingatkan sekarang, atau batalkan (alasan wajib). */
export function AksiPiutang({ id, tertagih, bisaBatal }: { id: string; tertagih: string; bisaBatal: boolean }) {
  const router = useRouter();
  const online = useOnline();
  const [batal, setBatal] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [proses, setProses] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ingatkan = async () => {
    if (!online) return setError(TIDAK_ADA_SINYAL);
    setProses(true);
    setError(null);
    const { error: err } = await createClient().rpc("ingatkan_patungan", { p_id: id });
    setProses(false);
    if (err) return setError(err.message);
    setPesan(`Pengingat terkirim ke ${tertagih}.`);
  };

  const batalkan = async () => {
    if (!online) return setError(TIDAK_ADA_SINYAL);
    if (!alasan.trim()) return setError("Alasan wajib diisi.");
    setProses(true);
    setError(null);
    const { error: err } = await createClient()
      .from("patungan")
      .update({ status: "dibatalkan", alasan: alasan.trim() })
      .eq("id", id)
      .select("id")
      .single();
    setProses(false);
    if (err) return setError(err.code === "PGRST116" ? "Tagihan sudah berubah. Muat ulang halaman." : err.message);
    router.refresh();
  };

  return (
    <div className="piutang-aksi">
      {batal ? (
        <>
          <input
            type="text"
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            placeholder="alasan membatalkan tagihan"
            aria-label={`Alasan membatalkan tagihan ${tertagih}`}
          />
          <div className="card-actions">
            <button type="button" className="btn-line" onClick={() => setBatal(false)} disabled={proses}>
              kembali/
            </button>
            <button type="button" className="btn-line" onClick={batalkan} disabled={proses || !online}>
              batalkan-tagihan/
            </button>
          </div>
        </>
      ) : (
        <div className="card-actions">
          <button type="button" className="btn-line" onClick={ingatkan} disabled={proses || !online || !!pesan}>
            {pesan ? "terkirim ✓" : "ingatkan/"}
          </button>
          {bisaBatal && (
            <button type="button" className="btn-line" onClick={() => setBatal(true)} disabled={proses}>
              batalkan/
            </button>
          )}
        </div>
      )}
      <p className="err" role="alert">
        {error}
      </p>
    </div>
  );
}

/** Dari kartu riwayat: minta patungan untuk belanja uang pribadi saya yang sudah dicatat. */
export function FormPatungan({
  kunci,
  userId,
  total,
  batas,
  owner,
}: {
  kunci: string;
  userId: string;
  total: number;
  batas: number; // nilai belanja - ganti - tagihan terbuka
  owner: Owner[]; // owner yang belum punya tagihan terbuka/lunas untuk belanja ini
}) {
  const router = useRouter();
  const online = useOnline();
  const [buka, setBuka] = useState(false);
  const [isi, setIsi] = useState<IsianPatungan>({});
  const [proses, setProses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useRef<Record<string, string> | null>(null);

  if (batas <= 0 || owner.length === 0) return null;

  const simpan = async () => {
    setError(null);
    if (!online) return setError(TIDAK_ADA_SINYAL);
    const t = totalPatungan(isi);
    if (t <= 0) return setError("Isi jumlah untuk minimal satu owner.");
    if (t > batas) return setError(`Maksimal ${rupiah(batas)} (sisa yang belum diganti/diminta).`);
    ids.current ??= Object.fromEntries(owner.map((o) => [o.id, crypto.randomUUID()]));
    setProses(true);
    try {
      await simpanPatungan(createClient(), kolomSumber(kunci), userId, isi, ids.current);
      setBuka(false);
      setIsi({});
      ids.current = null;
      router.refresh();
    } catch (x) {
      setError(x instanceof Error ? x.message : "Gagal menyimpan.");
    } finally {
      setProses(false);
    }
  };

  if (!buka) {
    return (
      <div className="card-actions">
        <button type="button" className="btn-line" onClick={() => setBuka(true)}>
          minta-patungan/
        </button>
      </div>
    );
  }

  return (
    <div className="ganti-form">
      <p className="ref">Owner yang diminta mendapat notifikasi, pengingat tiap 3 hari, dan boleh menolak dengan alasan.</p>
      <PilihPatungan idAwal={`minta-${kunci}`} owner={owner} total={total} batas={batas} isi={isi} onChange={setIsi} />
      <p className="err" role="alert">
        {error}
      </p>
      <div className="card-actions">
        <button type="button" className="btn-line" onClick={() => setBuka(false)} disabled={proses}>
          kembali/
        </button>
        <button type="button" className="btn-go" onClick={simpan} disabled={proses || !online}>
          <span>{proses ? "Menyimpan…" : online ? "Minta patungan" : "Tidak ada sinyal"}</span>
          <span className="arr">↗</span>
        </button>
      </div>
    </div>
  );
}
