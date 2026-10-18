import { Mega } from "@/components/judul";
import { BatalCatatan, FormCatatanRnd, PilihTahap } from "@/components/rnd-aksi";
import { ambilOwnerLain } from "@/lib/data";
import { rupiah, tanggal } from "@/lib/format";
import { ambilIde, labelSubjenis } from "@/lib/rnd";
import { ambilSesi } from "@/lib/sesi";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

const LABEL_JENIS = { progres: "progres", uji: "uji", keputusan: "keputusan" } as const;

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [{ userId }, data] = await Promise.all([ambilSesi(), ambilIde(id)]);
  if (!data) notFound();
  const penyetuju = await ambilOwnerLain(userId);
  const { ide, catatan } = data;
  const final = ide.tahap === "diadopsi" || ide.tahap === "dihentikan";

  return (
    <>
      <section className="fs">
        <div className="fs-head">
          <span className="slug">{ide.jalur}/{labelSubjenis(ide.jalur, ide.subjenis).toLowerCase()}</span>
          <span className="hint">PIC {ide.pic}</span>
        </div>
        <div className="fs-body form-1">
          <h2 className="rnd-judul">{ide.judul}</h2>
          {ide.tujuan && <p className="dtext">{ide.tujuan}</p>}
          <dl className="kv">
            <dt>catatan</dt>
            <dd>{ide.jumlah_catatan}</dd>
            <dt>biaya R&amp;D</dt>
            <dd>{rupiah(ide.biaya_rnd)}</dd>
            {ide.terakhir && (
              <>
                <dt>terakhir</dt>
                <dd>{tanggal(ide.terakhir)}</dd>
              </>
            )}
          </dl>
          <PilihTahap ideId={ide.id} tahap={ide.tahap} />
        </div>
      </section>

      <FormCatatanRnd ideId={ide.id} final={final} adaKeputusanMenunggu={ide.keputusan_menunggu} penyetuju={penyetuju} />

      <section className="fs">
        <div className="fs-head">
          <span className="slug">linimasa/</span>
          <span className="hint">terbaru di atas</span>
        </div>
      </section>
      {catatan.length === 0 ? (
        <div className="empty">belum ada catatan</div>
      ) : (
        <ol className="linimasa">
          {catatan.map((c) => (
            <li key={c.id} className={`lm lm-${c.jenis}${c.status === "batal" ? " lm-batal" : ""}`}>
              <div className="lm-h">
                <span className="slug">{LABEL_JENIS[c.jenis]}/</span>
                {c.jenis === "keputusan" && <b className="lm-kep">{c.keputusan}</b>}
                <span className={`status st-${c.status === "aktif" ? "approved" : c.status === "menunggu" ? "pending" : "rejected"}`}>
                  {c.status}
                </span>
              </div>
              <p className="dtext">{c.isi}</p>
              {c.lampiranUrl && (
                <a href={c.lampiranUrl} target="_blank" rel="noreferrer" className="bukti lm-foto">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URL storage */}
                  <img src={c.lampiranUrl} alt="Lampiran" loading="lazy" />
                </a>
              )}
              <p className="hint">
                {tanggal(c.tanggal)} · {c.pencatat}
                {c.penyetuju && ` · disetujui ${c.penyetuju}`}
                {c.status === "batal" && c.alasanBatal && ` · batal: ${c.alasanBatal}`}
              </p>
              {c.pencatatId === userId && c.status !== "batal" && <BatalCatatan id={c.id} />}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <div className="hero">
        <Mega teks="R&D" />
      </div>
      <div className="hero-info">
        <div className="hi-left mono-row">
          <Link href="/rnd" className="link-line">← daftar-ide/</Link>
          <span>detail</span>
        </div>
        <div className="hi-right">
          <p>Catat perkembangan sampai ada keputusan. Keputusan baru berlaku setelah disetujui owner lain.</p>
        </div>
      </div>
      <Suspense fallback={<div className="loading-row"><div className="spin dark" /></div>}>
        <Detail params={params} />
      </Suspense>
    </>
  );
}
