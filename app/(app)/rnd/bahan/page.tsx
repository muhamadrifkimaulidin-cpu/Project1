import { Mega } from "@/components/judul";
import { BarisBahan, FormBahan } from "@/components/rnd-bahan";
import { ambilBahan } from "@/lib/rnd";
import Link from "next/link";
import { Suspense } from "react";

async function Daftar() {
  const bahan = await ambilBahan();
  return bahan.length === 0 ? (
    <div className="empty">belum ada bahan — tambahkan dari form di atas</div>
  ) : (
    <div className="cards">
      {bahan.map((b) => (
        <BarisBahan key={b.id} b={b} />
      ))}
    </div>
  );
}

export default function Page() {
  return (
    <>
      <div className="hero">
        <Mega teks="R&D" ekor={<span className="mega-sub">bahan</span>} />
      </div>
      <div className="hero-info">
        <div className="hi-left mono-row">
          <Link href="/rnd" className="link-line">← daftar-ide/</Link>
          <span>harga per satuan</span>
        </div>
        <div className="hi-right">
          <p>Harga dipakai untuk menghitung biaya per cup di setiap uji racikan. Perubahan harga tercatat di log audit.</p>
        </div>
      </div>
      <FormBahan />
      <section className="fs">
        <div className="fs-head">
          <span className="slug">daftar-bahan/</span>
        </div>
      </section>
      <Suspense fallback={<div className="loading-row"><div className="spin dark" /></div>}>
        <Daftar />
      </Suspense>
    </>
  );
}
