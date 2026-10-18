"use client";

import { useOnline } from "@/components/status-sinyal";
import { SUBJENIS, type Jalur } from "@/lib/rnd-label";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function FormIde({ owner, userId }: { owner: { id: string; nama: string }[]; userId: string }) {
  const router = useRouter();
  const online = useOnline();
  const [judul, setJudul] = useState("");
  const [jalur, setJalur] = useState<Jalur>("produk");
  const [subjenis, setSubjenis] = useState("racikan");
  const [tujuan, setTujuan] = useState("");
  const [pic, setPic] = useState(userId);
  const [proses, setProses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idIde = useRef<string | null>(null); // id stabil: simpan ulang tidak membuat ide ganda

  const gantiJalur = (j: Jalur) => {
    setJalur(j);
    setSubjenis(Object.keys(SUBJENIS[j])[0]);
  };

  const simpan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (proses) return;
    setError(null);
    if (!online) return setError("Tidak ada sinyal. Tidak ada yang disimpan.");
    if (!judul.trim()) return setError("Isi judul ide.");
    setProses(true);
    idIde.current ??= crypto.randomUUID();
    const { error: err } = await createClient()
      .from("rnd_ide")
      .insert({ id: idIde.current, judul: judul.trim(), jalur, subjenis, tujuan: tujuan.trim() || null, pic_id: pic });
    setProses(false);
    if (err && err.code !== "23505") return setError(err.message);
    router.push(`/rnd/${idIde.current}`);
    router.refresh();
  };

  return (
    <form className="entry-form" onSubmit={simpan} noValidate>
      <section className="fs">
        <div className="fs-head">
          <span className="slug">ide-baru/</span>
        </div>
        <div className="fs-body form-1">
          <div className="fld">
            <label htmlFor="judul">Judul</label>
            <input id="judul" type="text" value={judul} onChange={(e) => setJudul(e.target.value)} placeholder="mis. Jus jeruk-sereh / SOP cuci blender" required />
          </div>
          <div className="fld">
            <label>Jalur</label>
            <div className="seg seg-wide" role="radiogroup" aria-label="Jalur">
              {(["produk", "sistem"] as const).map((j) => (
                <button key={j} type="button" role="radio" aria-checked={jalur === j} className={jalur === j ? "active" : undefined} onClick={() => gantiJalur(j)}>
                  {j === "produk" ? "Produk" : "Sistem"}
                </button>
              ))}
            </div>
          </div>
          <div className="fld">
            <label>Jenis</label>
            <div className="chips">
              {Object.entries(SUBJENIS[jalur]).map(([k, v]) => (
                <button key={k} type="button" className={`chip${subjenis === k ? " active" : ""}`} aria-pressed={subjenis === k} onClick={() => setSubjenis(k)}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="fld">
            <label htmlFor="tujuan">Tujuan / hipotesis</label>
            <textarea id="tujuan" value={tujuan} onChange={(e) => setTujuan(e.target.value)} placeholder="Apa yang ingin dibuktikan atau dicapai?" />
          </div>
          <div className="fld">
            <label htmlFor="pic">PIC</label>
            <select id="pic" value={pic} onChange={(e) => setPic(e.target.value)}>
              {owner.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nama}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>
      <div className="form-actions">
        <p className="err form-err" role="alert">{error}</p>
        <button type="submit" className="btn-go" disabled={proses || !online}>
          <span>{proses ? "Menyimpan…" : online ? "Simpan ide" : "Tidak ada sinyal"}</span>
          <span className="arr">↗</span>
        </button>
      </div>
    </form>
  );
}
