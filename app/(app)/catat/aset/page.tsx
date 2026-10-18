import { FormAset } from "@/components/form-aset";
import { Mega } from "@/components/judul";
import { ambilKategori, ambilOutletUtama, ambilOwnerLain } from "@/lib/data";
import { ambilSesi } from "@/lib/sesi";
import Link from "next/link";
import { Suspense } from "react";

async function Isi() {
  const { userId } = await ambilSesi();
  const [kategori, outlet, penyetuju] = await Promise.all([ambilKategori(), ambilOutletUtama(), ambilOwnerLain(userId)]);
  if (!outlet) {
    return <div className="notice bad">Belum ada outlet di database. Jalankan SQL setup outlet di Supabase dulu.</div>;
  }
  const kategoriAset = kategori.find((k) => k.nama === "Pembelian aset" && k.jenis === "pengeluaran");
  return <FormAset outletId={outlet.id} userId={userId} penyetuju={penyetuju} kategoriAsetId={kategoriAset?.id ?? null} />;
}

export default function Page() {
  return (
    <>
      <div className="hero">
        <Mega teks="CATAT" ekor={<span className="mega-sub">aset</span>} />
      </div>
      <div className="hero-info">
        <div className="hi-left mono-row">
          <Link href="/catat" className="link-line">
            ← pilih-jenis/
          </Link>
          <span>alat · perlengkapan</span>
        </div>
        <div className="hi-right">
          <p>Alat yang dipakai lebih dari setahun. Nilainya disusutkan per bulan sesuai umur pakai.</p>
        </div>
      </div>
      <Suspense
        fallback={
          <div className="loading-row">
            <div className="spin dark" />
          </div>
        }
      >
        <Isi />
      </Suspense>
    </>
  );
}
