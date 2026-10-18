"use client";

import { PilihFoto } from "@/components/pilih-foto";
import { useOnline } from "@/components/status-sinyal";
import { unggahBukti } from "@/lib/foto";
import { hariIniLokal } from "@/lib/format";
import { LABEL_TAHAP, type Tahap } from "@/lib/rnd-label";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const TAHAP_BEBAS: Tahap[] = ["ide", "diuji", "evaluasi"];

/** Pindah tahap ide/diuji/evaluasi. Diadopsi/dihentikan hanya lewat keputusan yang disetujui. */
export function PilihTahap({ ideId, tahap }: { ideId: string; tahap: Tahap }) {
  const router = useRouter();
  const online = useOnline();
  const [proses, setProses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const final = tahap === "diadopsi" || tahap === "dihentikan";

  const ubah = async (t: Tahap) => {
    if (t === tahap || final) return;
    setProses(true);
    setError(null);
    const { error: err } = await createClient().from("rnd_ide").update({ tahap: t }).eq("id", ideId);
    setProses(false);
    if (err) return setError(err.message);
    router.refresh();
  };

  return (
    <div className="fld">
      <div className="tahap-bar" role="radiogroup" aria-label="Tahap">
        {[...TAHAP_BEBAS, "diadopsi" as const, "dihentikan" as const].map((t) => {
          const kunci = !TAHAP_BEBAS.includes(t);
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tahap === t}
              className={`tahap${tahap === t ? " active" : ""}${kunci ? " kunci" : ""}`}
              disabled={proses || final || kunci || !online}
              onClick={() => ubah(t)}
            >
              {LABEL_TAHAP[t]}
            </button>
          );
        })}
      </div>
      <p className="ref">
        {final
          ? "Ide sudah diputuskan — tahap terkunci."
          : "Diadopsi / Dihentikan hanya lewat catatan keputusan yang disetujui owner lain."}
      </p>
      {error && <p className="err">{error}</p>}
    </div>
  );
}

/** Tambah catatan: progres atau keputusan (uji racikan menyusul di PR berikutnya). */
export function FormCatatanRnd({ ideId, final, adaKeputusanMenunggu, penyetuju }: {
  ideId: string;
  final: boolean;
  adaKeputusanMenunggu: boolean;
  penyetuju: string[];
}) {
  const router = useRouter();
  const online = useOnline();
  const [jenis, setJenis] = useState<"progres" | "keputusan">("progres");
  const [keputusan, setKeputusan] = useState<"diadopsi" | "dihentikan">("diadopsi");
  const [isi, setIsi] = useState("");
  const [tgl, setTgl] = useState("");
  const [hariIni, setHariIni] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [proses, setProses] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idCatatan = useRef<string | null>(null);

  useEffect(() => {
    const t = hariIniLokal();
    setHariIni(t);
    setTgl(t);
  }, []);

  const bisaKeputusan = !final && !adaKeputusanMenunggu;

  const simpan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (proses) return;
    setError(null);
    if (!online) return setError("Tidak ada sinyal. Tidak ada yang disimpan.");
    if (!isi.trim()) return setError(jenis === "keputusan" ? "Tulis alasan / hasil keputusan." : "Tulis isi catatan.");
    if (tgl > hariIni) return setError("Tanggal tidak boleh di masa depan.");
    const supabase = createClient();
    idCatatan.current ??= crypto.randomUUID();
    const id = idCatatan.current;
    try {
      const lampiran = foto ? await unggahBukti(supabase, "rnd", tgl, id, foto, setProses) : null;
      setProses("Menyimpan…");
      const { error: err } = await supabase.from("rnd_catatan").insert({
        id,
        ide_id: ideId,
        tanggal: tgl,
        jenis,
        isi: isi.trim(),
        keputusan: jenis === "keputusan" ? keputusan : null,
        lampiran_path: lampiran,
      });
      if (err && err.code !== "23505") throw new Error(err.message);
      setIsi("");
      setFoto(null);
      setJenis("progres");
      idCatatan.current = null;
      router.refresh();
    } catch (x) {
      setError(x instanceof Error ? x.message : "Gagal menyimpan.");
    } finally {
      setProses(null);
    }
  };

  return (
    <form className="fs" onSubmit={simpan} noValidate>
      <div className="fs-head">
        <span className="slug">tambah-catatan/</span>
      </div>
      <div className="fs-body form-1">
        <div className="seg seg-wide" role="radiogroup" aria-label="Jenis catatan">
          <button type="button" role="radio" aria-checked={jenis === "progres"} className={jenis === "progres" ? "active" : undefined} onClick={() => setJenis("progres")}>
            Progres
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={jenis === "keputusan"}
            className={jenis === "keputusan" ? "active" : undefined}
            disabled={!bisaKeputusan}
            onClick={() => setJenis("keputusan")}
          >
            Keputusan
          </button>
        </div>
        {!bisaKeputusan && (
          <p className="ref">{final ? "Ide sudah diputuskan." : "Masih ada keputusan yang menunggu persetujuan."}</p>
        )}
        {jenis === "keputusan" && (
          <div className="fld">
            <label>Keputusan</label>
            <div className="seg seg-wide" role="radiogroup" aria-label="Keputusan">
              {(["diadopsi", "dihentikan"] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={keputusan === k} className={keputusan === k ? "active" : undefined} onClick={() => setKeputusan(k)}>
                  {k === "diadopsi" ? "Diadopsi" : "Dihentikan"}
                </button>
              ))}
            </div>
            <p className="ref">Berlaku setelah disetujui {penyetuju.join(" atau ")}.</p>
          </div>
        )}
        <div className="fld">
          <label htmlFor="isi-catatan">{jenis === "keputusan" ? "Alasan / hasil final" : "Isi"}</label>
          <textarea
            id="isi-catatan"
            value={isi}
            onChange={(e) => setIsi(e.target.value)}
            placeholder={jenis === "keputusan" ? "mis. SOP final v2 terlampir; dipakai mulai buka" : "mis. dicoba 3 supplier jeruk, harga & kualitas…"}
          />
        </div>
        <div className="fld">
          <label htmlFor="tgl-catatan">Tanggal</label>
          <input id="tgl-catatan" type="date" value={tgl} max={hariIni || undefined} onChange={(e) => setTgl(e.target.value)} />
        </div>
        <div className="fld">
          <label>Foto / lampiran (opsional)</label>
          <PilihFoto file={foto} onChange={setFoto} />
        </div>
        {error && <p className="err">{error}</p>}
        <button type="submit" className="btn-go" disabled={!!proses || !online}>
          <span>{proses ?? (online ? (jenis === "keputusan" ? "Ajukan keputusan" : "Simpan catatan") : "Tidak ada sinyal")}</span>
          <span className="arr">+</span>
        </button>
      </div>
    </form>
  );
}

/** Pencatat membatalkan catatannya sendiri (alasan wajib). */
export function BatalCatatan({ id }: { id: string }) {
  const router = useRouter();
  const [proses, setProses] = useState(false);
  const batal = async () => {
    const alasan = window.prompt("Alasan membatalkan catatan ini (wajib):")?.trim();
    if (!alasan) return;
    setProses(true);
    const { error } = await createClient().from("rnd_catatan").update({ status: "batal", alasan_batal: alasan }).eq("id", id);
    setProses(false);
    if (error) return window.alert(error.message);
    router.refresh();
  };
  return (
    <button type="button" className="link-line btn-batal" onClick={batal} disabled={proses}>
      batalkan/
    </button>
  );
}
