import { FormTransaksi } from "@/components/form-transaksi";
import { Mega } from "@/components/judul";
import { ambilKategori, ambilOutletUtama, ambilOwnerLain } from "@/lib/data";
import { ambilIdeTerbuka } from "@/lib/rnd";
import { ambilSesi } from "@/lib/sesi";
import Link from "next/link";
import { Suspense } from "react";

async function Isi() {
  const { userId } = await ambilSesi();
  const [kategori, outlet, penyetuju, ideTerbuka] = await Promise.all([
    ambilKategori(),
    ambilOutletUtama(),
    ambilOwnerLain(userId),
    ambilIdeTerbuka(),
  ]);
  if (!outlet) {
    return <div className="notice bad">Belum ada outlet di database. Jalankan SQL setup outlet di Supabase dulu.</div>;
  }
  return (
    <FormTransaksi kategori={kategori} outletId={outlet.id} userId={userId} penyetuju={penyetuju} ideTerbuka={ideTerbuka} />
  );
}

export default function Page() {
  return (
    <>
      <div className="hero">
        <Mega teks="CATAT" ekor={<span className="mega-sub">uang</span>} />
      </div>
      <div className="hero-info">
        <div className="hi-left mono-row">
          <Link href="/catat" className="link-line">
            ← pilih-jenis/
          </Link>
          <span>pengeluaran · pemasukan</span>
        </div>
        <div className="hi-right">
          <p>Tanggal boleh mundur untuk mencatat belanja R&amp;D sebelumnya. Sertakan foto nota.</p>
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
