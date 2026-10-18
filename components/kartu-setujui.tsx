"use client";

import { InputUang } from "@/components/input-uang";
import { useOnline } from "@/components/status-sinyal";
import type { ItemAntrean } from "@/lib/antrean";
import { rupiah, tanggal } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";

function Rincian({ item }: { item: ItemAntrean }) {
  return (
    <>
      <dl className="kv">
        <dt>tanggal</dt>
        <dd>{tanggal(item.tanggal)}</dd>
        <dt>dicatat</dt>
        <dd>{item.pencatat}</dd>
        {item.rincian.map(([k, v]) => (
          <Fragment key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </Fragment>
        ))}
        {item.keterangan && (
          <>
            <dt>keterangan</dt>
            <dd>{item.keterangan}</dd>
          </>
        )}
      </dl>
      {item.foto.length > 0 ? (
        <div className="bukti-list">
          {item.foto.map((f) => (
            <a key={f.label} href={f.url} target="_blank" rel="noreferrer" className="bukti">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed URL storage, bukan aset statis */}
              <img src={f.url} alt={`Foto ${f.label}`} loading="lazy" />
              <span className="slug">{f.label}/</span>
            </a>
          ))}
        </div>
      ) : (
        <div className="notice warn bukti-kosong">Belum ada foto bukti.</div>
      )}
    </>
  );
}

/** Kartu catatan yang boleh saya setujui: Setujui / Tolak (alasan wajib). */
export function KartuSetujui({ item }: { item: ItemAntrean }) {
  const router = useRouter();
  const online = useOnline();
  const [mode, setMode] = useState<"lihat" | "tolak">("lihat");
  const [alasan, setAlasan] = useState("");
  const [nilai, setNilai] = useState<number | null>(item.jumlah);
  const [proses, setProses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selesai, setSelesai] = useState<string | null>(null);

  const kirim = async (perubahan: Record<string, unknown>, pesan: string) => {
    setProses(true);
    setError(null);
    const { error: err } = await createClient()
      .from(item.tabel)
      .update(perubahan)
      .eq("id", item.id)
      .select("id")
      .single();
    setProses(false);
    if (err) {
      // 0 baris = RLS menolak atau sudah diproses owner lain
      setError(
        err.code === "PGRST116"
          ? "Tidak bisa diproses — mungkin sudah disetujui/ditolak owner lain. Muat ulang halaman."
          : err.message,
      );
      return;
    }
    setSelesai(pesan);
    router.refresh();
  };

  const setujui = () => {
    if (item.setorBarang && (!nilai || nilai <= 0)) return setError("Isi nilai yang disepakati.");
    const ubahNilai = item.setorBarang && nilai !== item.jumlah;
    const teks = ubahNilai
      ? `Setujui dengan nilai disepakati ${rupiah(nilai)} (dicatat ${rupiah(item.jumlah)})?`
      : `Setujui ${item.judul} ${rupiah(item.jumlah)}?`;
    if (!window.confirm(teks)) return;
    kirim(
      { status: "aktif", ...(item.setorBarang ? { harga_beli: nilai } : {}) },
      `Disetujui${ubahNilai ? ` dengan nilai ${rupiah(nilai)}` : ""}.`,
    );
  };

  const tolak = () => {
    if (!alasan.trim()) return setError("Alasan penolakan wajib diisi.");
    kirim({ status: "batal", alasan_batal: alasan.trim() }, "Ditolak — catatan dibatalkan dengan alasan tercatat.");
  };

  if (selesai) {
    return (
      <article className="card">
        <div className="card-h">
          <div className="card-t">
            {item.judul}
            <small>{rupiah(item.jumlah)}</small>
          </div>
          <span className={`status ${selesai.startsWith("Disetujui") ? "st-approved" : "st-rejected"}`}>
            {selesai.startsWith("Disetujui") ? "aktif" : "batal"}
          </span>
        </div>
        <p className="hint">{selesai}</p>
      </article>
    );
  }

  return (
    <article className="card">
      <div className="card-h">
        <div className="card-t">
          {item.judul}
          <small>
            {item.pemilikUang ? `uang ${item.pemilikUang}` : "kas usaha"} · dicatat {item.pencatat}
          </small>
        </div>
        <span className="card-rp">{rupiah(item.jumlah)}</span>
      </div>

      <Rincian item={item} />

      {item.setorBarang && mode === "lihat" && (
        <div className="fld nilai-sepakat">
          <label htmlFor={`nilai-${item.id}`}>Nilai yang disepakati</label>
          <InputUang id={`nilai-${item.id}`} nilai={nilai} onChange={setNilai} />
          <p className="ref">Nilai ini yang masuk sebagai modal. Ubah bila bertiga sepakat nilai berbeda.</p>
        </div>
      )}

      {mode === "tolak" && (
        <div className="fld tolak-box">
          <label htmlFor={`alasan-${item.id}`}>Alasan penolakan (wajib)</label>
          <textarea
            id={`alasan-${item.id}`}
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            placeholder="mis. nota tidak terbaca / jumlah tidak sesuai nota"
          />
        </div>
      )}

      <p className="err" role="alert">
        {error}
      </p>

      <div className="card-actions">
        {mode === "lihat" ? (
          <>
            <button type="button" className="btn-line" onClick={() => setMode("tolak")} disabled={proses}>
              tolak/
            </button>
            <button type="button" className="btn-go" onClick={setujui} disabled={proses || !online}>
              <span>{proses ? "Memproses…" : online ? "Setujui" : "Tidak ada sinyal"}</span>
              <span className="arr">✓</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn-line"
              onClick={() => {
                setMode("lihat");
                setError(null);
              }}
              disabled={proses}
            >
              batal/
            </button>
            <button type="button" className="btn-go btn-danger" onClick={tolak} disabled={proses || !online}>
              <span>{proses ? "Memproses…" : online ? "Tolak" : "Tidak ada sinyal"}</span>
              <span className="arr">✕</span>
            </button>
          </>
        )}
      </div>
    </article>
  );
}

/** Kartu ringkas untuk catatan saya yang menunggu owner lain (tanpa tombol). */
export function KartuMenungguLain({ item, penyetuju }: { item: ItemAntrean; penyetuju: string }) {
  return (
    <article className="card">
      <div className="card-h">
        <div className="card-t">
          {item.judul}
          <small>
            {tanggal(item.tanggal)} · menunggu {penyetuju}
          </small>
        </div>
        <span className="card-rp">{rupiah(item.jumlah)}</span>
      </div>
      <span className="status st-pending">menunggu</span>
    </article>
  );
}
