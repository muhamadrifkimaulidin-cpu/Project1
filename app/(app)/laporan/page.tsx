import { Mega } from "@/components/judul";
import { TombolCsv } from "@/components/tombol-csv";
import { rupiah, tanggal } from "@/lib/format";
import {
  ambilBiayaPraOperasiPerKategori,
  ambilNilaiBukuAset,
  ambilPorsiRinci,
  ambilTalangan,
  ambilTanpaBukti,
  BENTUK,
  LABEL_BENTUK,
  LABEL_SUMBER_ASET,
} from "@/lib/laporan";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

const persenTeks = (p: number | null) => (p === null ? "—" : `${p.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`);

function Bagian({ id, slug, hint, csv, children }: { id: string; slug: string; hint: string; csv?: ReactNode; children: ReactNode }) {
  return (
    <section className="fs lap" id={id}>
      <div className="fs-head">
        <span className="slug">{slug}</span>
        <span className="hint">{hint}</span>
      </div>
      {children}
      {csv && <div className="lap-csv">{csv}</div>}
    </section>
  );
}

function Baris({ kiri, sub, kanan, tebal }: { kiri: ReactNode; sub?: ReactNode; kanan: ReactNode; tebal?: boolean }) {
  return (
    <div className={`lap-row${tebal ? " lap-total" : ""}`}>
      <div className="lap-l">
        {kiri}
        {sub && <small>{sub}</small>}
      </div>
      <div className="lap-r">{kanan}</div>
    </div>
  );
}

async function Porsi() {
  const porsi = await ambilPorsiRinci();
  const total = porsi.reduce((a, p) => a + p.modalBersih, 0);
  return (
    <Bagian
      id="porsi"
      slug="porsi-kepemilikan/"
      hint="kontribusi aktif − penarikan"
      csv={
        <TombolCsv
          nama="porsi"
          kolom={["owner", ...BENTUK, "total_kontribusi", "penarikan_modal", "ganti_antar_owner", "modal_bersih", "porsi_persen"]}
          baris={porsi.map((p) => [p.nama, ...BENTUK.map((b) => p.perBentuk[b]), p.totalKontribusi, p.totalPenarikan, p.pindahModal, p.modalBersih, p.persen])}
        />
      }
    >
      {porsi.map((p) => (
        <div key={p.ownerId} className="lap-owner">
          <Baris kiri={<b>{p.nama}</b>} kanan={<b>{persenTeks(p.persen)}</b>} />
          <dl className="kv lap-kv">
            {BENTUK.map((b) => (
              <div key={b} className="lap-kv-row">
                <dt>{LABEL_BENTUK[b].toLowerCase()}</dt>
                <dd>{rupiah(p.perBentuk[b])}</dd>
              </div>
            ))}
            {p.totalPenarikan > 0 && (
              <div className="lap-kv-row">
                <dt>penarikan modal</dt>
                <dd>−{rupiah(p.totalPenarikan)}</dd>
              </div>
            )}
            {p.pindahModal !== 0 && (
              <div className="lap-kv-row">
                <dt>ganti antar-owner</dt>
                <dd>{p.pindahModal > 0 ? "+" : "−"}{rupiah(Math.abs(p.pindahModal))}</dd>
              </div>
            )}
            <div className="lap-kv-row lap-kv-total">
              <dt>modal bersih</dt>
              <dd>{rupiah(p.modalBersih)}</dd>
            </div>
          </dl>
        </div>
      ))}
      <Baris kiri="Total modal bersih" kanan={rupiah(total)} tebal />
    </Bagian>
  );
}

async function Talangan() {
  const talangan = await ambilTalangan();
  const total = talangan.reduce((a, t) => a + t.sisa, 0);
  return (
    <Bagian
      id="talangan"
      slug="talangan/"
      hint="utang usaha ke owner, tidak menambah porsi"
      csv={<TombolCsv nama="talangan" kolom={["owner", "sisa_talangan"]} baris={talangan.map((t) => [t.nama, t.sisa])} />}
    >
      {talangan.map((t) => (
        <Baris key={t.nama} kiri={t.nama} kanan={rupiah(t.sisa)} />
      ))}
      <Baris kiri="Total talangan" kanan={rupiah(total)} tebal />
    </Bagian>
  );
}

async function PraOperasi() {
  const biaya = await ambilBiayaPraOperasiPerKategori();
  const t = biaya.reduce((a, b) => ({ kas: a.kas + b.kas, owner: a.owner + b.owner, total: a.total + b.total }), { kas: 0, owner: 0, total: 0 });
  return (
    <Bagian
      id="pra-operasi"
      slug="biaya-pra-operasi/"
      hint="R&D dan persiapan, per kategori"
      csv={
        <TombolCsv
          nama="biaya-pra-operasi"
          kolom={["kategori", "dari_kas_usaha", "dibayar_owner", "total", "jumlah_catatan"]}
          baris={biaya.map((b) => [b.kategori, b.kas, b.owner, b.total, b.catatan])}
        />
      }
    >
      {biaya.length === 0 ? (
        <div className="empty">belum ada pengeluaran pra-operasi yang aktif</div>
      ) : (
        <>
          {biaya.map((b) => (
            <Baris
              key={b.kategori}
              kiri={b.kategori}
              sub={`${b.catatan} catatan · kas ${rupiah(b.kas)} · owner ${rupiah(b.owner)}`}
              kanan={rupiah(b.total)}
            />
          ))}
          <Baris kiri="Total pra-operasi" sub={`kas ${rupiah(t.kas)} · owner ${rupiah(t.owner)}`} kanan={rupiah(t.total)} tebal />
        </>
      )}
    </Bagian>
  );
}

async function Aset() {
  const aset = await ambilNilaiBukuAset();
  const total = aset.reduce((a, x) => ({ harga: a.harga + x.hargaBeli, buku: a.buku + x.nilaiBuku }), { harga: 0, buku: 0 });
  return (
    <Bagian
      id="aset"
      slug="aset-nilai-buku/"
      hint="penyusutan garis lurus per bulan"
      csv={
        <TombolCsv
          nama="aset-nilai-buku"
          kolom={["nama", "tanggal_beli", "asal", "harga_beli", "umur_bulan", "bulan_terpakai", "nilai_buku", "kondisi", "lokasi"]}
          baris={aset.map((x) => [x.nama, x.tanggalBeli, LABEL_SUMBER_ASET[x.sumber] ?? x.sumber, x.hargaBeli, x.umurBulan, x.bulanTerpakai, Math.round(x.nilaiBuku), x.kondisi, x.lokasi])}
        />
      }
    >
      {aset.length === 0 ? (
        <div className="empty">belum ada aset aktif</div>
      ) : (
        <>
          {aset.map((x) => (
            <Baris
              key={x.id}
              kiri={x.nama}
              sub={`${tanggal(x.tanggalBeli)} · ${LABEL_SUMBER_ASET[x.sumber] ?? x.sumber} · beli ${rupiah(x.hargaBeli)} · ${x.bulanTerpakai}/${x.umurBulan} bln${x.kondisi === "rusak" ? " · rusak" : ""}`}
              kanan={rupiah(x.nilaiBuku)}
            />
          ))}
          <Baris kiri="Total nilai buku" sub={`harga beli ${rupiah(total.harga)}`} kanan={rupiah(total.buku)} tebal />
        </>
      )}
    </Bagian>
  );
}

async function TanpaBukti() {
  const daftar = await ambilTanpaBukti();
  return (
    <Bagian
      id="tanpa-bukti"
      slug="belum-ada-bukti/"
      hint={`${daftar.length} catatan tanpa foto nota/transfer`}
      csv={
        <TombolCsv
          nama="belum-ada-bukti"
          kolom={["tanggal", "jenis", "keterangan", "jumlah", "dicatat_oleh", "status"]}
          baris={daftar.map((d) => [d.tanggal, d.jenis, d.judul, d.jumlah, d.pencatat, d.status])}
        />
      }
    >
      {daftar.length === 0 ? (
        <div className="empty">semua catatan sudah berbukti ✓</div>
      ) : (
        daftar.map((d, i) => (
          <Baris
            key={i}
            kiri={`${d.jenis} · ${d.judul}`}
            sub={`${tanggal(d.tanggal)} · dicatat ${d.pencatat}${d.status === "menunggu" ? " · menunggu" : ""}`}
            kanan={rupiah(d.jumlah)}
          />
        ))
      )}
    </Bagian>
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
        <Mega teks="LAPORAN" />
      </div>
      <div className="hero-info">
        <div className="hi-left mono-row">
          <span>hanya catatan aktif</span>
          <span>ekspor csv per bagian</span>
        </div>
        <div className="hi-right">
          <p>Angka dihitung dari catatan yang sudah disetujui — sama untuk ketiga owner.</p>
        </div>
      </div>
      <div className="filters filters-1">
        <div className="chips">
          <a href="#porsi" className="chip">porsi</a>
          <a href="#talangan" className="chip">talangan</a>
          <a href="#pra-operasi" className="chip">pra-operasi</a>
          <a href="#aset" className="chip">aset</a>
          <a href="#tanpa-bukti" className="chip">tanpa bukti</a>
          <Link href="/riwayat" className="chip">riwayat ↗</Link>
        </div>
      </div>
      <Suspense fallback={<Memuat />}>
        <Porsi />
      </Suspense>
      <Suspense fallback={<Memuat />}>
        <Talangan />
      </Suspense>
      <Suspense fallback={<Memuat />}>
        <PraOperasi />
      </Suspense>
      <Suspense fallback={<Memuat />}>
        <Aset />
      </Suspense>
      <Suspense fallback={<Memuat />}>
        <TanpaBukti />
      </Suspense>
    </>
  );
}
