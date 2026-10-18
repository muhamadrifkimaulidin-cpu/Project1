"use client";

import { PilihFoto } from "@/components/pilih-foto";
import { useOnline } from "@/components/status-sinyal";
import { unggahBukti } from "@/lib/foto";
import { hariIniLokal } from "@/lib/format";
import { LABEL_TAHAP, type Tahap } from "@/lib/rnd-label";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
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

export type BahanPilihan = { id: string; nama: string; satuan: string; harga_per_satuan: number };
type BarisResep = { key: string; bahanId: string; takaran: string };

const angka = (s: string) => Number(s.replace(",", "."));

/** Tambah catatan: progres, uji (resep + jumlah cup), atau keputusan. */
export function FormCatatanRnd({ ideId, final, adaKeputusanMenunggu, penyetuju, bahan }: {
  ideId: string;
  final: boolean;
  adaKeputusanMenunggu: boolean;
  penyetuju: string[];
  bahan: BahanPilihan[];
}) {
  const router = useRouter();
  const online = useOnline();
  const [jenis, setJenis] = useState<"progres" | "uji" | "keputusan">("progres");
  const [keputusan, setKeputusan] = useState<"diadopsi" | "dihentikan">("diadopsi");
  const [isi, setIsi] = useState("");
  const [tgl, setTgl] = useState("");
  const [hariIni, setHariIni] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [cup, setCup] = useState("");
  const [resep, setResep] = useState<BarisResep[]>([]);
  const [proses, setProses] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // id stabil per isian: simpan ulang setelah sinyal putus tidak membuat catatan/resep ganda
  const idCatatan = useRef<string | null>(null);

  useEffect(() => {
    const t = hariIniLokal();
    setHariIni(t);
    setTgl(t);
  }, []);

  const bisaKeputusan = !final && !adaKeputusanMenunggu;
  const hargaBahan = new Map(bahan.map((b) => [b.id, b]));
  const biayaBatch = resep.reduce((t, r) => t + (hargaBahan.get(r.bahanId)?.harga_per_satuan ?? 0) * (angka(r.takaran) || 0), 0);
  const estimasiPerCup = angka(cup) > 0 ? Math.round(biayaBatch / angka(cup)) : null;

  const tambahBaris = () => setResep((x) => [...x, { key: crypto.randomUUID(), bahanId: "", takaran: "" }]);
  const ubahBaris = (key: string, ubah: Partial<BarisResep>) => setResep((x) => x.map((r) => (r.key === key ? { ...r, ...ubah } : r)));
  const hapusBaris = (key: string) => setResep((x) => x.filter((r) => r.key !== key));

  const gantiJenis = (j: typeof jenis) => {
    setJenis(j);
    if (j === "uji" && resep.length === 0) tambahBaris();
  };

  const simpan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (proses) return;
    setError(null);
    if (!online) return setError("Tidak ada sinyal. Tidak ada yang disimpan.");
    if (!isi.trim()) return setError(jenis === "keputusan" ? "Tulis alasan / hasil keputusan." : "Tulis isi catatan.");
    if (tgl > hariIni) return setError("Tanggal tidak boleh di masa depan.");
    const barisResep = resep.filter((r) => r.bahanId || r.takaran);
    if (jenis === "uji") {
      if (!(Number.isInteger(angka(cup)) && angka(cup) > 0)) return setError("Isi jumlah cup yang dihasilkan (bilangan bulat).");
      if (!barisResep.length) return setError("Isi minimal satu bahan di resep.");
      if (barisResep.some((r) => !r.bahanId || !(angka(r.takaran) > 0))) return setError("Setiap baris resep perlu bahan dan takaran > 0.");
    }
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
        jumlah_cup: jenis === "uji" ? angka(cup) : null,
        lampiran_path: lampiran,
      });
      if (err && err.code !== "23505") throw new Error(err.message);
      if (jenis === "uji") {
        // id baris resep = key baris (stabil) -> percobaan ulang tidak menggandakan resep
        const { error: errResep } = await supabase.from("rnd_resep").upsert(
          barisResep.map((r) => ({ id: r.key, catatan_id: id, bahan_id: r.bahanId, takaran: angka(r.takaran) })),
          { onConflict: "id", ignoreDuplicates: true },
        );
        if (errResep) throw new Error(`Catatan uji tersimpan, tapi resep gagal: ${errResep.message}`);
      }
      setIsi("");
      setFoto(null);
      setCup("");
      setResep([]);
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
          {(["progres", "uji", "keputusan"] as const).map((j) => (
            <button
              key={j}
              type="button"
              role="radio"
              aria-checked={jenis === j}
              className={jenis === j ? "active" : undefined}
              disabled={(j === "keputusan" && !bisaKeputusan) || (j === "uji" && final)}
              onClick={() => gantiJenis(j)}
            >
              {j === "progres" ? "Progres" : j === "uji" ? "Uji" : "Keputusan"}
            </button>
          ))}
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
        {jenis === "uji" && (
          <div className="fld resep">
            <label>Resep satu batch</label>
            {bahan.length === 0 ? (
              <p className="notice warn">Belum ada bahan. Tambahkan dulu di <Link className="link-line" href="/rnd/bahan">daftar-bahan/</Link>.</p>
            ) : (
              <>
                {resep.map((r) => {
                  const b = hargaBahan.get(r.bahanId);
                  return (
                    <div key={r.key} className="resep-baris">
                      <select value={r.bahanId} onChange={(e) => ubahBaris(r.key, { bahanId: e.target.value })} aria-label="Bahan">
                        <option value="">Pilih bahan…</option>
                        {bahan.map((x) => (
                          <option key={x.id} value={x.id}>{x.nama}</option>
                        ))}
                      </select>
                      <div className="inp-unit">
                        <input type="text" inputMode="decimal" value={r.takaran} placeholder="0" aria-label="Takaran"
                          onChange={(e) => ubahBaris(r.key, { takaran: e.target.value.replace(/[^0-9.,]/g, "") })} />
                        <span className="unit">{b?.satuan ?? "—"}</span>
                      </div>
                      <button type="button" className="btn-x" onClick={() => hapusBaris(r.key)} aria-label="Hapus baris">✕</button>
                    </div>
                  );
                })}
                <button type="button" className="btn-line" onClick={tambahBaris}>+ bahan/</button>
              </>
            )}
            <div className="fld">
              <label htmlFor="cup">Jumlah cup dihasilkan</label>
              <input id="cup" type="text" inputMode="numeric" value={cup} onChange={(e) => setCup(e.target.value.replace(/\D/g, ""))} placeholder="mis. 4" />
            </div>
            <p className="estimasi">
              estimasi/ <b>{estimasiPerCup === null ? "—" : `Rp${estimasiPerCup.toLocaleString("id-ID")}`}</b> per cup
              <small> · batch Rp{Math.round(biayaBatch).toLocaleString("id-ID")} (harga bahan saat ini, dibekukan saat disimpan)</small>
            </p>
          </div>
        )}
        <div className="fld">
          <label htmlFor="isi-catatan">{jenis === "keputusan" ? "Alasan / hasil final" : jenis === "uji" ? "Catatan uji" : "Isi"}</label>
          <textarea
            id="isi-catatan"
            value={isi}
            onChange={(e) => setIsi(e.target.value)}
            placeholder={
              jenis === "keputusan" ? "mis. SOP final v2 terlampir; dipakai mulai buka"
              : jenis === "uji" ? "mis. batch 1: jeruk lebih banyak, es dikurangi"
              : "mis. dicoba 3 supplier jeruk, harga & kualitas…"
            }
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
          <span>{proses ?? (online ? (jenis === "keputusan" ? "Ajukan keputusan" : jenis === "uji" ? "Simpan uji" : "Simpan catatan") : "Tidak ada sinyal")}</span>
          <span className="arr">+</span>
        </button>
      </div>
    </form>
  );
}

/** Tambah skor uji rasa. Penilai cukup nama (boleh orang luar). */
export function FormSkor({ catatanId }: { catatanId: string }) {
  const router = useRouter();
  const online = useOnline();
  const [buka, setBuka] = useState(false);
  const [penilai, setPenilai] = useState("");
  const [skor, setSkor] = useState<number | null>(null);
  const [komentar, setKomentar] = useState("");
  const [proses, setProses] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const simpan = async () => {
    setError(null);
    if (!penilai.trim()) return setError("Isi nama penilai.");
    if (!skor) return setError("Pilih skor 1–5.");
    setProses(true);
    const { error: err } = await createClient()
      .from("rnd_skor")
      .insert({ catatan_id: catatanId, penilai: penilai.trim(), skor, komentar: komentar.trim() || null });
    setProses(false);
    if (err) return setError(err.message);
    setPenilai("");
    setSkor(null);
    setKomentar("");
    router.refresh();
  };

  if (!buka) {
    return (
      <button type="button" className="link-line btn-batal" onClick={() => setBuka(true)}>
        + skor-penilai/
      </button>
    );
  }
  return (
    <div className="form-1 skor-form">
      <input type="text" value={penilai} onChange={(e) => setPenilai(e.target.value)} placeholder="Nama penilai (boleh orang luar)" aria-label="Nama penilai" />
      <div className="chips" role="radiogroup" aria-label="Skor">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={skor === n} className={`chip chip-skor${skor === n ? " active" : ""}`} onClick={() => setSkor(n)}>
            {n}
          </button>
        ))}
      </div>
      <input type="text" value={komentar} onChange={(e) => setKomentar(e.target.value)} placeholder="Komentar (opsional)" aria-label="Komentar" />
      {error && <p className="err">{error}</p>}
      <div className="card-actions">
        <button type="button" className="btn-line" onClick={() => setBuka(false)} disabled={proses}>batal/</button>
        <button type="button" className="btn-go" onClick={simpan} disabled={proses || !online}>
          <span>{proses ? "Menyimpan…" : "Simpan skor"}</span>
          <span className="arr">✓</span>
        </button>
      </div>
    </div>
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
