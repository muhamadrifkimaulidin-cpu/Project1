import { FormSetor } from "@/components/form-setor";
import { Mega } from "@/components/judul";
import { ambilOwnerLain } from "@/lib/data";
import { ambilSesi } from "@/lib/sesi";
import Link from "next/link";
import { Suspense } from "react";

async function Isi() {
  const { userId } = await ambilSesi();
  const penyetuju = await ambilOwnerLain(userId);
  return <FormSetor userId={userId} penyetuju={penyetuju} />;
}

export default function Page() {
  return (
    <>
      <div className="hero">
        <Mega teks="SETOR" ekor={<span className="mega-sub">uang</span>} />
      </div>
      <div className="hero-info">
        <div className="hi-left mono-row">
          <Link href="/catat" className="link-line">
            ← pilih-jenis/
          </Link>
          <span>modal · kas usaha</span>
        </div>
        <div className="hi-right">
          <p>Uang yang kamu masukkan ke kas usaha. Setelah disetujui, langsung menambah porsi kepemilikanmu.</p>
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
