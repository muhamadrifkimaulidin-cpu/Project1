import { Mega } from "@/components/judul";
import { ambilBiayaPraOperasi, ambilPorsi, ambilSaldoKas, hitungBelumAdaBukti, hitungMenungguSaya } from "@/lib/data";
import { AksiPiutang, AksiTagihan } from "@/components/patungan-aksi";
import { TanggalHariIni } from "@/components/tanggal-hari-ini";
import { TombolNotifikasi } from "@/components/tombol-notifikasi";
import { rupiah, tanggal } from "@/lib/format";
import { ambilBelanjaPribadiSaya, ambilPatunganBeranda, type Patungan } from "@/lib/patungan";
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

function StatusTagihan({ p }: { p: Patungan }) {
  if (p.status === "lunas") return <span className="status st-approved">lunas</span>;
  if (p.status === "ditolak") return <span className="status st-rejected">tidak ikut</span>;
  return <span className="status st-pending">{p.diproses > 0 ? "menunggu konfirmasi" : "belum lunas"}</span>;
}

/** Patungan (migrasi 008): tagihan yang harus saya bayar + patungan yang saya minta dan belum lunas. */
async function Patungan() {
  const { userId } = await ambilSesi();
  const { tagihan, piutang } = await ambilPatunganBeranda(userId);
  if (!tagihan.length && !piutang.length) return null;
  const pilihanTanggung = tagihan.length ? await ambilBelanjaPribadiSaya(userId) : [];

  return (
    <section className="fs" id="patungan">
      <div className="fs-head">
        <span className="slug">patungan/</span>
        <span className="hint">porsi bergeser setelah uangnya diterima</span>
      </div>
      <div className="cards">
        {tagihan.map((t) => (
          <article key={t.id} className="card card-tagihan">
            <div className="card-h">
              <div className="card-t">
                Kamu belum ganti ke {t.penagih}
                <small>
                  {t.belanja.judul} · {rupiah(t.belanja.nilai)} · {tanggal(t.belanja.tanggal)}
                </small>
              </div>
              <div className="card-kanan">
                <span className="card-rp">{rupiah(t.sisa + t.diproses)}</span>
                <StatusTagihan p={t} />
              </div>
            </div>
            <p className="ref">
              diminta {rupiah(t.jumlah)}
              {t.dibayar > 0 ? ` · sudah dibayar ${rupiah(t.dibayar)}` : ""}
              {t.diproses > 0 ? ` · ${rupiah(t.diproses)} menunggu konfirmasi ${t.penagih}` : ""}
            </p>
            <AksiTagihan
              tagihan={t}
              userId={userId}
              belanjaAktif={t.belanja.status === "aktif"}
              pilihanTanggung={pilihanTanggung.filter((x) => x.kunci !== t.kunci)}
            />
          </article>
        ))}
        {piutang.map(({ belanja, patungan }) => (
          <article key={belanja.kunci} className="card card-piutang">
            <div className="card-h">
              <div className="card-t">
                Patunganmu belum lunas
                <small>
                  {belanja.judul} · {tanggal(belanja.tanggal)}
                  {belanja.status === "menunggu" ? " · belanja masih menunggu persetujuan" : ""}
                </small>
              </div>
              <div className="card-kanan">
                <span className="card-rp">{rupiah(belanja.nilai)}</span>
              </div>
            </div>
            <ul className="piutang-list">
              {patungan.map((p) => (
                <li key={p.id}>
                  <div className="piutang-baris">
                    <span>
                      <b>{p.tertagih}</b> {rupiah(p.jumlah)}
                      {p.status === "terbuka" && p.dibayar + p.diproses > 0 ? ` · sisa ${rupiah(p.sisa + p.diproses)}` : ""}
                    </span>
                    <StatusTagihan p={p} />
                  </div>
                  {p.status === "ditolak" && (
                    <p className="ref">
                      “{p.alasan}”{p.tanggung ? ` · menanggung ${p.tanggung}` : ""}
                    </p>
                  )}
                  {p.status === "terbuka" && belanja.status === "aktif" && p.sisa > 0 && (
                    <AksiPiutang id={p.id} tertagih={p.tertagih} bisaBatal={p.diproses === 0} />
                  )}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
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
        <Link href="/rnd" className="btn-line">
          r&amp;d/
        </Link>
        <Link href="/riwayat" className="btn-line">
          riwayat/
        </Link>
      </div>
      <Suspense fallback={<Memuat />}>
        <Ringkasan />
      </Suspense>
      <Suspense fallback={<Memuat />}>
        <Patungan />
      </Suspense>
      <Suspense fallback={<Memuat />}>
        <KartuPorsi />
      </Suspense>
      <TombolNotifikasi />
    </>
  );
}
