import { FormIde } from "@/components/form-ide";
import { Mega } from "@/components/judul";
import { ambilOwner } from "@/lib/rnd";
import { ambilSesi } from "@/lib/sesi";
import Link from "next/link";
import { Suspense } from "react";

async function Isi() {
  const [{ userId }, owner] = await Promise.all([ambilSesi(), ambilOwner()]);
  return <FormIde owner={owner} userId={userId} />;
}

export default function Page() {
  return (
    <>
      <div className="hero">
        <Mega teks="R&D" ekor={<span className="mega-sub">ide baru</span>} />
      </div>
      <div className="hero-info">
        <div className="hi-left mono-row">
          <Link href="/rnd" className="link-line">← daftar-ide/</Link>
          <span>produk · sistem</span>
        </div>
        <div className="hi-right">
          <p>Produk: racikan, menu, kemasan. Sistem: SOP pembuatan, alat, supplier, alur kas.</p>
        </div>
      </div>
      <Suspense fallback={<div className="loading-row"><div className="spin dark" /></div>}>
        <Isi />
      </Suspense>
    </>
  );
}
