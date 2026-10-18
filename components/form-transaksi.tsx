"use client";

import { InputUang } from "@/components/input-uang";
import { PilihFoto } from "@/components/pilih-foto";
import { useOnline } from "@/components/status-sinyal";
import { kompresFoto } from "@/lib/foto";
import { rupiah, tanggal as fmtTanggal } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

export type Kategori = { id: string; nama: string; jenis: "pemasukan" | "pengeluaran"; fase: "pra_operasi" | "operasi" };

type Jenis = Kategori["jenis"];
type Metode = "tunai" | "qris" | "transfer";
type Klaim = "modal" | "talangan";

// Nilai yang disepakati di CLAUDE.md §4.2: pengeluaran kas di atas ini butuh persetujuan
const BATAS_SETUJU_KAS = 500_000;

function hariIniLokal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Hasil = { status: "aktif" | "menunggu"; jumlah: number; jenis: Jenis; tanpaBukti: boolean };

export function FormTransaksi({
  kategori,
  outletId,
  userId,
  penyetuju,
}: {
  kategori: Kategori[];
  outletId: string;
  userId: string;
  penyetuju: string[]; // nama owner lain
}) {
  const router = useRouter();
  const online = useOnline();

  const [jenis, setJenis] = useState<Jenis>("pengeluaran");
  const [tgl, setTgl] = useState("");
  const [hariIni, setHariIni] = useState("");
  const [kategoriId, setKategoriId] = useState("");
  const [jumlah, setJumlah] = useState<number | null>(null);
  const [metode, setMetode] = useState<Metode>("tunai");
  const [keterangan, setKeterangan] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [uangPribadi, setUangPribadi] = useState(false);
  const [klaim, setKlaim] = useState<Klaim>("modal");

  const [proses, setProses] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  // id catatan dibuat sekali per isian form: dipakai untuk nama file bukti, dan bila tombol simpan
  // ditekan ulang setelah sinyal putus, percobaan kedua dikenali sebagai catatan yang sama (bukan ganda)
  const idCatatan = useRef<string | null>(null);

  // Tanggal default = hari ini menurut jam HP (server Vercel memakai UTC)
  useEffect(() => {
    const t = hariIniLokal();
    setHariIni(t);
    setTgl(t);
  }, []);

  const opsiKategori = useMemo(() => kategori.filter((k) => k.jenis === jenis), [kategori, jenis]);
  const pribadi = jenis === "pengeluaran" && uangPribadi;
  const akanMenunggu = pribadi || (jenis === "pengeluaran" && (jumlah ?? 0) > BATAS_SETUJU_KAS);

  const gantiJenis = (j: Jenis) => {
    setJenis(j);
    setKategoriId("");
  };

  const reset = () => {
    setKategoriId("");
    setJumlah(null);
    setKeterangan("");
    setFoto(null);
    setUangPribadi(false);
    setKlaim("modal");
    setHasil(null);
    setError(null);
    idCatatan.current = null;
    window.scrollTo({ top: 0 });
  };

  const simpan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (proses) return;
    setError(null);
    if (!online) return setError("Tidak ada sinyal. Tidak ada yang disimpan — coba lagi setelah tersambung.");
    if (!tgl) return setError("Isi tanggal.");
    if (tgl > hariIni) return setError("Tanggal tidak boleh di masa depan.");
    if (!kategoriId) return setError("Pilih kategori.");
    if (!jumlah || jumlah <= 0) return setError("Isi jumlah lebih dari Rp0.");
    if (jenis === "pengeluaran" && !foto) {
      const lanjut = window.confirm(
        "Belum ada foto bukti. Catatan tetap disimpan tapi masuk daftar \"belum ada bukti\". Lanjut?",
      );
      if (!lanjut) return;
    }

    const supabase = createClient();
    idCatatan.current ??= crypto.randomUUID();
    const id = idCatatan.current;
    let buktiPath: string | null = null;

    try {
      if (foto) {
        setProses("Mengompres foto…");
        const f = await kompresFoto(foto);
        buktiPath = `transaksi/${tgl.slice(0, 7)}/${id}.${f.ext}`;
        setProses("Mengunggah foto…");
        const up = await supabase.storage
          .from("bukti")
          .upload(buktiPath, f.blob, { contentType: f.contentType, upsert: false });
        // "already exists" = foto ini sudah terunggah di percobaan sebelumnya
        if (up.error && !/exists/i.test(up.error.message)) throw new Error(`Upload foto gagal: ${up.error.message}`);
      }

      setProses("Menyimpan…");
      const { data, error: err } = await supabase
        .from("transaksi")
        .insert({
          id,
          outlet_id: outletId,
          tanggal: tgl,
          jenis,
          kategori_id: kategoriId,
          jumlah,
          metode,
          sumber_dana: pribadi ? "owner" : "kas_usaha",
          dibayar_owner_id: pribadi ? userId : null,
          klaim: pribadi ? klaim : null,
          keterangan: keterangan.trim() || null,
          bukti_path: buktiPath,
        })
        .select("status")
        .single<{ status: "aktif" | "menunggu" }>();
      let status = data?.status;
      if (err?.code === "23505") {
        // Sudah tersimpan di percobaan sebelumnya (id sama): ambil statusnya, jangan buat baru
        const lama = await supabase.from("transaksi").select("status").eq("id", id).single<{ status: Hasil["status"] }>();
        if (lama.error) throw new Error(lama.error.message);
        status = lama.data.status;
      } else if (err) {
        throw new Error(err.message);
      }

      setHasil({ status: status!, jumlah, jenis, tanpaBukti: jenis === "pengeluaran" && !buktiPath });
      router.refresh(); // badge & beranda ikut terbarui
      window.scrollTo({ top: 0 });
    } catch (x) {
      setError(x instanceof Error ? x.message : "Gagal menyimpan.");
    } finally {
      setProses(null);
    }
  };

  if (hasil) {
    return (
      <div className="fs">
        <div className="fs-body">
          <div className={`notice${hasil.status === "menunggu" ? " warn" : ""}`}>
            <b>
              {hasil.jenis === "pengeluaran" ? "Pengeluaran" : "Pemasukan"} {rupiah(hasil.jumlah)} tersimpan.
            </b>
            <br />
            {hasil.status === "menunggu"
              ? `Status menunggu — perlu disetujui ${penyetuju.join(" atau ")} sebelum dihitung.`
              : "Status aktif — langsung dihitung di saldo kas."}
            {hasil.tanpaBukti && (
              <>
                <br />
                Belum ada foto bukti: masuk daftar &quot;belum ada bukti&quot;.
              </>
            )}
          </div>
          <div className="aksi-hasil">
            <button type="button" className="btn-go" onClick={reset}>
              <span>Catat lagi</span>
              <span className="arr">+</span>
            </button>
            <Link href="/beranda" className="btn-line">
              ke-beranda/
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form className="entry-form" onSubmit={simpan} noValidate>
      <section className="fs">
        <div className="fs-head">
          <span className="slug">jenis/</span>
        </div>
        <div className="fs-body">
          <div className="seg seg-wide" role="radiogroup" aria-label="Jenis transaksi">
            {(["pengeluaran", "pemasukan"] as const).map((j) => (
              <button
                key={j}
                type="button"
                role="radio"
                aria-checked={jenis === j}
                className={jenis === j ? "active" : undefined}
                onClick={() => gantiJenis(j)}
              >
                {j === "pengeluaran" ? "Pengeluaran" : "Pemasukan"}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="fs">
        <div className="fs-head">
          <span className="slug">rincian/</span>
          {tgl && tgl < hariIni && <span className="hint">dicatat mundur: {fmtTanggal(tgl)}</span>}
        </div>
        <div className="fs-body form-1">
          <div className="fld">
            <label htmlFor="tgl">Tanggal</label>
            <input id="tgl" type="date" value={tgl} max={hariIni || undefined} onChange={(e) => setTgl(e.target.value)} required />
          </div>
          <div className="fld">
            <label htmlFor="kategori">Kategori</label>
            <select id="kategori" value={kategoriId} onChange={(e) => setKategoriId(e.target.value)} required>
              <option value="">Pilih kategori…</option>
              {(["pra_operasi", "operasi"] as const).map((fase) => {
                const isi = opsiKategori.filter((k) => k.fase === fase);
                if (!isi.length) return null;
                return (
                  <optgroup key={fase} label={fase === "pra_operasi" ? "Pra-operasi (R&D, persiapan)" : "Operasi"}>
                    {isi.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.nama}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>
          <div className="fld">
            <label htmlFor="jumlah">Jumlah</label>
            <InputUang id="jumlah" nilai={jumlah} onChange={setJumlah} required />
          </div>
          <div className="fld">
            <label>Metode</label>
            <div className="seg seg-wide" role="radiogroup" aria-label="Metode">
              {(["tunai", "qris", "transfer"] as const).map((m) => (
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
            <label htmlFor="keterangan">Keterangan</label>
            <textarea
              id="keterangan"
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="mis. jeruk 5 kg untuk uji racikan #3"
            />
          </div>
        </div>
      </section>

      <section className="fs">
        <div className="fs-head">
          <span className="slug">foto-bukti/</span>
          <span className="hint">{jenis === "pengeluaran" ? "nota / struk / transfer" : "opsional"}</span>
        </div>
        <div className="fs-body">
          <PilihFoto file={foto} onChange={setFoto} />
        </div>
      </section>

      {jenis === "pengeluaran" && (
        <section className="fs">
          <div className="fs-head">
            <span className="slug">sumber-dana/</span>
          </div>
          <div className="fs-body form-1">
            <label className="tile">
              <input type="checkbox" checked={uangPribadi} onChange={(e) => setUangPribadi(e.target.checked)} />
              <span className="tile-box" />
              <span>Dibayar dari uang pribadi saya</span>
            </label>
            {uangPribadi && (
              <div className="fld">
                <label>Dihitung sebagai</label>
                <div className="seg seg-wide" role="radiogroup" aria-label="Klaim">
                  {(["modal", "talangan"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={klaim === k}
                      className={klaim === k ? "active" : undefined}
                      onClick={() => setKlaim(k)}
                    >
                      {k === "modal" ? "Modal" : "Talangan"}
                    </button>
                  ))}
                </div>
                <p className="ref">
                  {klaim === "modal"
                    ? "Modal: menambah porsi kepemilikan saya."
                    : "Talangan: dipinjamkan ke usaha, nanti dikembalikan dari kas — tidak menambah porsi."}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {akanMenunggu && (
        <div className="notice warn">
          Catatan ini akan berstatus <b>menunggu</b> dan baru dihitung setelah disetujui {penyetuju.join(" atau ")}
          {pribadi ? " (uang pribadi owner)." : ` (pengeluaran kas di atas ${rupiah(BATAS_SETUJU_KAS)}).`}
        </div>
      )}

      <div className="form-actions">
        <p className="err form-err" role="alert">
          {error}
        </p>
        <button type="submit" className="btn-go" disabled={!!proses || !online}>
          <span>{proses ?? (online ? "Simpan" : "Tidak ada sinyal")}</span>
          <span className="arr">↗</span>
        </button>
      </div>
    </form>
  );
}
