"use client";

import { InputUang } from "@/components/input-uang";
import { PilihFoto } from "@/components/pilih-foto";
import { useOnline } from "@/components/status-sinyal";
import { unggahBukti } from "@/lib/foto";
import { hariIniLokal, rupiah, tanggal as fmtTanggal } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Metode = "tunai" | "qris" | "transfer";

/** Setor uang owner ke kas usaha -> kontribusi bentuk setor_uang (selalu menunggu persetujuan). */
export function FormSetor({ userId, penyetuju }: { userId: string; penyetuju: string[] }) {
  const router = useRouter();
  const online = useOnline();

  const [tgl, setTgl] = useState("");
  const [hariIni, setHariIni] = useState("");
  const [jumlah, setJumlah] = useState<number | null>(null);
  const [metode, setMetode] = useState<Metode>("transfer");
  const [keterangan, setKeterangan] = useState("");
  const [foto, setFoto] = useState<File | null>(null);

  const [proses, setProses] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasil, setHasil] = useState<{ jumlah: number; tanpaBukti: boolean } | null>(null);
  // Sama seperti form transaksi: id stabil per isian supaya simpan ulang tidak membuat catatan ganda
  const idCatatan = useRef<string | null>(null);

  useEffect(() => {
    const t = hariIniLokal();
    setHariIni(t);
    setTgl(t);
  }, []);

  const reset = () => {
    setJumlah(null);
    setKeterangan("");
    setFoto(null);
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
    if (!jumlah || jumlah <= 0) return setError("Isi jumlah lebih dari Rp0.");
    if (!foto) {
      const lanjut = window.confirm(
        "Belum ada foto bukti transfer/serah terima. Catatan tetap disimpan tapi masuk daftar \"belum ada bukti\". Lanjut?",
      );
      if (!lanjut) return;
    }

    const supabase = createClient();
    idCatatan.current ??= crypto.randomUUID();
    const id = idCatatan.current;

    try {
      const buktiPath = foto ? await unggahBukti(supabase, "kontribusi", tgl, id, foto, setProses) : null;
      setProses("Menyimpan…");
      const { error: err } = await supabase.from("kontribusi").insert({
        id,
        owner_id: userId,
        tanggal: tgl,
        bentuk: "setor_uang",
        jumlah,
        metode,
        keterangan: keterangan.trim() || null,
        bukti_path: buktiPath,
      });
      // 23505 = sudah tersimpan di percobaan sebelumnya (id sama)
      if (err && err.code !== "23505") throw new Error(err.message);

      setHasil({ jumlah, tanpaBukti: !buktiPath });
      router.refresh();
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
          <div className="notice warn">
            <b>Setor uang {rupiah(hasil.jumlah)} tersimpan.</b>
            <br />
            Status menunggu — dihitung sebagai modal setelah disetujui {penyetuju.join(" atau ")}.
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
          <span className="slug">rincian/</span>
          {tgl && tgl < hariIni && <span className="hint">dicatat mundur: {fmtTanggal(tgl)}</span>}
        </div>
        <div className="fs-body form-1">
          <div className="fld">
            <label htmlFor="jumlah">Jumlah disetor</label>
            <InputUang id="jumlah" nilai={jumlah} onChange={setJumlah} required />
          </div>
          <div className="fld">
            <label htmlFor="tgl">Tanggal</label>
            <input id="tgl" type="date" value={tgl} max={hariIni || undefined} onChange={(e) => setTgl(e.target.value)} required />
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
            <label htmlFor="keterangan">Keterangan</label>
            <textarea
              id="keterangan"
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="mis. setoran awal ke rekening usaha"
            />
          </div>
        </div>
      </section>

      <section className="fs">
        <div className="fs-head">
          <span className="slug">foto-bukti/</span>
          <span className="hint">{metode === "tunai" ? "foto uang / tanda terima" : "bukti transfer"}</span>
        </div>
        <div className="fs-body">
          <PilihFoto file={foto} onChange={setFoto} />
        </div>
      </section>

      <div className="notice warn">
        Setor uang selalu <b>menunggu</b> dan baru menambah porsi setelah disetujui {penyetuju.join(" atau ")}.
      </div>

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
