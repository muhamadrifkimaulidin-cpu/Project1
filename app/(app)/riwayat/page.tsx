import { Mega } from "@/components/judul";
import { FormGanti } from "@/components/form-ganti";
import { AksiRiwayat } from "@/components/riwayat-aksi";
import { PilihFilter } from "@/components/riwayat-filter";
import { ambilKategori } from "@/lib/data";
import { rupiah, tanggal } from "@/lib/format";
import { ambilOwner } from "@/lib/rnd";
import { ambilCatatan, BATAS_PER_JENIS, bacaFilter, type Filter, type ItemRiwayat } from "@/lib/riwayat";
import { ambilSesi } from "@/lib/sesi";
import Link from "next/link";
import { Fragment, Suspense } from "react";

type SP = Promise<Record<string, string | string[] | undefined>>;

const KELAS_STATUS = { menunggu: "st-pending", aktif: "st-approved", batal: "st-rejected" } as const;

/** URL riwayat dengan satu filter diganti (null = hapus). */
function tautan(f: Filter, ubah: Partial<Filter>) {
  const g = { ...f, ...ubah };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(g)) if (v) q.set(k, v);
  const s = q.toString();
  return `/riwayat${s ? `?${s}` : ""}`;
}

function sebagaiQuery(f: Filter): Record<string, string> {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v)) as Record<string, string>;
}

function Kartu({ item, userId, owner }: { item: ItemRiwayat; userId: string; owner: { id: string; nama: string }[] }) {
  return (
    <article className={`card${item.status === "batal" ? " card-batal" : ""}`}>
      <div className="card-h">
        <div className="card-t">
          {item.judul}
          <small>
            {tanggal(item.tanggal)} · {item.pemilik ? `uang ${item.pemilik}` : "kas usaha"}
          </small>
        </div>
        <div className="card-kanan">
          <span className="card-rp">{rupiah(item.jumlah)}</span>
          <span className={`status ${KELAS_STATUS[item.status]}`}>{item.status}</span>
        </div>
      </div>
      <dl className="kv">
        <dt>dicatat</dt>
        <dd>{item.pencatat}</dd>
        {item.penyetuju && (
          <>
            <dt>disetujui</dt>
            <dd>{item.penyetuju}</dd>
          </>
        )}
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
        {item.status === "batal" && item.alasanBatal && (
          <>
            <dt>alasan batal</dt>
            <dd>{item.alasanBatal}</dd>
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
        !item.adaBukti && item.status !== "batal" && <div className="notice warn bukti-kosong">Belum ada foto bukti.</div>
      )}
      {item.ganti && (
        <div className="ganti-ringkas">
          <p className="slug">pembagian-bayar/</p>
          <ul>
            <li>
              dibayar duluan oleh <b>{item.ganti.pembayar}</b>: {rupiah(item.ganti.total)}
            </li>
            {item.ganti.diganti.map((d, i) => (
              <li key={i}>
                {d.nama} mengganti {rupiah(d.jumlah)}
                {d.status === "menunggu" && <span className="status st-pending">menunggu</span>}
              </li>
            ))}
            <li>
              masih ditanggung {item.ganti.pembayar}: <b>{rupiah(item.ganti.sisa)}</b>
            </li>
          </ul>
          {!item.pengajuan && item.tabel !== "ganti_modal" && (
            <FormGanti tabel={item.tabel as "transaksi" | "aset"} belanjaId={item.id} info={item.ganti} userId={userId} owner={owner} />
          )}
        </div>
      )}
      <AksiRiwayat item={item} userId={userId} />
    </article>
  );
}

async function Daftar({ searchParams }: { searchParams: SP }) {
  const f = bacaFilter(await searchParams);
  const [{ userId }, owner, kategori, { items, terpotong }] = await Promise.all([
    ambilSesi(),
    ambilOwner(),
    ambilKategori(),
    ambilCatatan({ filter: f }),
  ]);
  const query = sebagaiQuery(f);
  const chip = (aktif: boolean) => `chip${aktif ? " active" : ""}`;

  return (
    <>
      <div className="filters filters-1 filter-riwayat">
        <div className="chips">
          <Link href={tautan(f, { status: null })} className={chip(!f.status)}>semua</Link>
          <Link href={tautan(f, { status: "menunggu" })} className={chip(f.status === "menunggu")}>menunggu</Link>
          <Link href={tautan(f, { status: "aktif" })} className={chip(f.status === "aktif")}>aktif</Link>
          <Link href={tautan(f, { status: "batal" })} className={chip(f.status === "batal")}>batal</Link>
        </div>
        <div className="chips">
          <Link href={tautan(f, { jenis: null })} className={chip(!f.jenis)}>semua jenis</Link>
          <Link href={tautan(f, { jenis: "transaksi", kategori: f.kategori })} className={chip(f.jenis === "transaksi")}>transaksi</Link>
          <Link href={tautan(f, { jenis: "aset", kategori: null })} className={chip(f.jenis === "aset")}>aset</Link>
          <Link href={tautan(f, { jenis: "setor", kategori: null })} className={chip(f.jenis === "setor")}>setor uang</Link>
          <Link href={tautan(f, { jenis: "ganti", kategori: null })} className={chip(f.jenis === "ganti")}>ganti antar-owner</Link>
        </div>
        <div className="filter-pilih">
          <PilihFilter kunci="owner" nilai={f.owner} semua="semua owner" opsi={owner} query={query} />
          {(!f.jenis || f.jenis === "transaksi") && (
            <PilihFilter kunci="kategori" nilai={f.kategori} semua="semua kategori" opsi={kategori} query={query} />
          )}
        </div>
      </div>
      <section className="fs">
        <div className="fs-head">
          <span className="slug">catatan/</span>
          <span className="hint">
            {items.length} catatan · terbaru di atas{f.kategori ? " · kategori hanya untuk transaksi" : ""}
          </span>
        </div>
      </section>
      {terpotong && (
        <div className="notice warn">
          Ditampilkan {BATAS_PER_JENIS} catatan terbaru per jenis. Persempit dengan filter untuk melihat yang lebih lama.
        </div>
      )}
      {items.length === 0 ? (
        <div className="empty">tidak ada catatan untuk filter ini</div>
      ) : (
        <div className="cards">
          {items.map((i) => (
            <Kartu key={`${i.tabel}-${i.id}`} item={i} userId={userId} owner={owner} />
          ))}
        </div>
      )}
    </>
  );
}

export default function Page({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <div className="hero">
        <Mega teks="RIWAYAT" />
      </div>
      <div className="hero-info">
        <div className="hi-left mono-row">
          <span>semua-catatan/</span>
          <span>tidak ada hapus</span>
        </div>
        <div className="hi-right">
          <p>
            Catatan aktif dibatalkan lewat pengajuan yang disetujui owner lain. Catatanmu yang masih menunggu boleh kamu
            tarik sendiri.
          </p>
        </div>
      </div>
      <Suspense
        fallback={
          <div className="loading-row">
            <div className="spin dark" />
          </div>
        }
      >
        <Daftar searchParams={searchParams} />
      </Suspense>
    </>
  );
}
