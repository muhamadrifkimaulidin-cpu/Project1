import { Mega } from "@/components/judul";
import { ambilBiayaPraOperasi, ambilPorsi, ambilSaldoKas, hitungBelumAdaBukti, hitungMenungguSaya } from "@/lib/data";
import { TanggalHariIni } from "@/components/tanggal-hari-ini";
import { rupiah } from "@/lib/format";
import { ambilSesi } from "@/lib/sesi";
import Link from "next/link";
import { Suspense } from "react";

function persenTeks(p: number | null) {
  return p === null ? "—" : `${p.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
}

async function KartuPorsi() {
  const [{ userId }, porsi] = await Promise.all([ambilSesi(), ambilPorsi()]);
  const adaModal = porsi.some((p) => p.persen !== null);

  return (
    <section className="fs">
      <div className="fs-head">
        <span className="slug">porsi-kepemilikan/</span>
        <span className="hint">kontribusi aktif − penarikan</span>
      </div>
      <div className="fs-body">
        {!adaModal && (
          <div className="notice warn porsi-kosong">
            Belum ada kontribusi yang disetujui. Porsi muncul setelah catatan pertama disetujui owner lain.
          </div>
        )}
        <div className="porsi-list">
          {porsi.map((p) => (
            <div key={p.owner_id} className={`porsi${p.owner_id === userId ? " saya" : ""}`}>
              <div className="porsi-h">
                <b>{p.nama}</b>
                {p.owner_id === userId && <span className="tag on">saya</span>}
                <span className="porsi-pct">{persenTeks(p.persen)}</span>
              </div>
              <div className="porsi-bar" aria-hidden>
                <span style={{ width: `${Math.max(0, Math.min(100, p.persen ?? 0))}%` }} />
              </div>
              <div className="porsi-meta">
                <span>modal {rupiah(p.modal_bersih)}</span>
                {p.total_penarikan > 0 && <span>tarik {rupiah(p.total_penarikan)}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

async function Ringkasan() {
  const { userId } = await ambilSesi();
  const [saldo, menunggu, praOp, tanpaBukti] = await Promise.all([
    ambilSaldoKas(),
    hitungMenungguSaya(userId),
    ambilBiayaPraOperasi(),
    hitungBelumAdaBukti(),
  ]);

  return (
    <div className="stats">
      <div className="stat">
        <span className="slug">saldo-kas/</span>
        <b className={saldo < 0 ? "neg" : undefined}>{rupiah(saldo)}</b>
        <small className="hint">
          {saldo < 0 ? "minus: pengeluaran kas melebihi setoran" : "setor uang + pemasukan − pengeluaran kas"}
        </small>
      </div>
      <Link href="/setujui" className={`stat stat-link${menunggu > 0 ? " perlu" : ""}`}>
        <span className="slug">menunggu-saya/</span>
        <b>{menunggu}</b>
        <small className="hint">{menunggu > 0 ? "ketuk untuk menyetujui ↗" : "tidak ada yang perlu disetujui"}</small>
      </Link>
      <div className="stat">
        <span className="slug">biaya-pra-operasi/</span>
        <b>{rupiah(praOp.total)}</b>
        <small className="hint">{praOp.catatan} catatan R&amp;D dan persiapan</small>
      </div>
      <div className={`stat${tanpaBukti > 0 ? " perlu" : ""}`}>
        <span className="slug">belum-ada-bukti/</span>
        <b>{tanpaBukti}</b>
        <small className="hint">{tanpaBukti > 0 ? "catatan tanpa foto nota/transfer" : "semua catatan sudah berbukti"}</small>
      </div>
    </div>
  );
}

function Memuat() {
  return (
    <div className="loading-row">
      <div className="spin dark" />
    </div>
  );
}

export default function Page() {
  return (
    <>
      <div className="hero">
        <Mega teks="BERANDA" />
      </div>
      <div className="hero-info">
        <div className="hi-left mono-row">
          <TanggalHariIni />
          <span>3rally · rengasdengklok</span>
        </div>
        <div className="hi-right">
          <p>Porsi dan kas dihitung hanya dari catatan yang sudah disetujui — sama untuk ketiga owner.</p>
        </div>
      </div>
      <div className="cta-row">
        <Link href="/catat/transaksi" className="btn-go">
          <span>Catat pengeluaran</span>
          <span className="arr">+</span>
        </Link>
      </div>
      <Suspense fallback={<Memuat />}>
        <Ringkasan />
      </Suspense>
      <Suspense fallback={<Memuat />}>
        <KartuPorsi />
      </Suspense>
    </>
  );
}
