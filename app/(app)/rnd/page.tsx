import { Mega } from "@/components/judul";
import { rupiah, tanggal } from "@/lib/format";
import { ambilDaftarIde, LABEL_TAHAP, labelSubjenis, type Jalur } from "@/lib/rnd";
import Link from "next/link";
import { Suspense } from "react";

async function Daftar({ searchParams }: { searchParams: Promise<{ jalur?: string }> }) {
  const { jalur } = await searchParams;
  const filter = jalur === "produk" || jalur === "sistem" ? (jalur as Jalur) : null;
  const semua = await ambilDaftarIde();
  const ide = filter ? semua.filter((i) => i.jalur === filter) : semua;
  const hitung = (j: Jalur) => semua.filter((i) => i.jalur === j).length;

  return (
    <>
      <div className="filters filters-1">
        <div className="chips">
          <Link href="/rnd" className={`chip${!filter ? " active" : ""}`}>semua {semua.length}</Link>
          <Link href="/rnd?jalur=produk" className={`chip${filter === "produk" ? " active" : ""}`}>produk {hitung("produk")}</Link>
          <Link href="/rnd?jalur=sistem" className={`chip${filter === "sistem" ? " active" : ""}`}>sistem {hitung("sistem")}</Link>
        </div>
      </div>
      {ide.length === 0 ? (
        <div className="empty">belum ada ide{filter ? ` di jalur ${filter}` : ""} — mulai dari tombol di atas</div>
      ) : (
        <div className="cards">
          {ide.map((i) => (
            <Link key={i.id} href={`/rnd/${i.id}`} className="card card-link">
              <div className="card-h">
                <div className="card-t">
                  {i.judul}
                  <small>
                    {labelSubjenis(i.jalur, i.subjenis)} · PIC {i.pic}
                  </small>
                </div>
                <span className={`status tahap-${i.tahap}`}>{LABEL_TAHAP[i.tahap]}</span>
              </div>
              <div className="c-sum">
                <span className="tag">{i.jumlah_catatan} catatan</span>
                {i.jumlah_uji > 0 && <span className="tag">{i.jumlah_uji} uji</span>}
                {i.biaya_rnd > 0 && <span className="tag">biaya {rupiah(i.biaya_rnd)}</span>}
                {i.terakhir && <span className="tag">terakhir {tanggal(i.terakhir)}</span>}
                {i.keputusan_menunggu && <span className="tag warn">keputusan menunggu</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<{ jalur?: string }> }) {
  return (
    <>
      <div className="hero">
        <Mega teks="R&D" />
      </div>
      <div className="hero-info">
        <div className="hi-left mono-row">
          <span>produk · sistem</span>
          <span>ide → diuji → evaluasi → keputusan</span>
        </div>
        <div className="hi-right">
          <p>Setiap ide dicatat perkembangannya sampai diputuskan bersama: diadopsi atau dihentikan.</p>
        </div>
      </div>
      <div className="cta-row">
        <Link href="/rnd/baru" className="btn-go">
          <span>Ide baru</span>
          <span className="arr">+</span>
        </Link>
        <Link href="/rnd/bahan" className="btn-line">
          bahan/
        </Link>
      </div>
      <Suspense fallback={<div className="loading-row"><div className="spin dark" /></div>}>
        <Daftar searchParams={searchParams} />
      </Suspense>
    </>
  );
}
