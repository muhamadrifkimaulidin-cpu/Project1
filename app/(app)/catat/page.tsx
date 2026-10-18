import { Mega } from "@/components/judul";
import { ArrowLeftRight, Banknote, FlaskConical, Package } from "lucide-react";
import Link from "next/link";

const PILIHAN = [
  {
    href: "/catat/transaksi",
    Ikon: ArrowLeftRight,
    judul: "Pengeluaran / pemasukan",
    ket: "Belanja R&D, bahan, operasional — termasuk yang dibayar pakai uang pribadi.",
    aktif: true,
  },
  {
    href: "/rnd",
    Ikon: FlaskConical,
    judul: "R&D",
    ket: "Ide produk & sistem (SOP, alat, supplier, alur kas): catat perkembangan sampai diputuskan.",
    aktif: true,
  },
  { href: "/catat/aset", Ikon: Package, judul: "Aset", ket: "Alat dan perlengkapan: dibeli atau barang pribadi yang disetor.", aktif: false },
  { href: "/catat/setor", Ikon: Banknote, judul: "Setor uang", ket: "Uang masuk ke kas usaha dari owner — menambah porsi.", aktif: true },
];

export default function Page() {
  return (
    <>
      <div className="hero">
        <Mega teks="CATAT" />
      </div>
      <div className="hero-info">
        <div className="hi-left mono-row">
          <span>pilih-jenis/</span>
          <span>satu kali catat</span>
        </div>
        <div className="hi-right">
          <p>Uang pribadi owner cukup dicatat sekali di sini — kontribusi modal dibuat otomatis.</p>
        </div>
      </div>
      <div className="cards pilihan">
        {PILIHAN.map(({ href, Ikon, judul, ket, aktif }) =>
          aktif ? (
            <Link key={href} href={href} className="card card-link">
              <div className="card-h">
                <div className="card-t">
                  {judul}
                  <small>{ket}</small>
                </div>
                <Ikon className="ic" />
              </div>
            </Link>
          ) : (
            <div key={href} className="card card-off" aria-disabled>
              <div className="card-h">
                <div className="card-t">
                  {judul}
                  <small>{ket}</small>
                </div>
                <span className="status st-pending">segera</span>
              </div>
            </div>
          ),
        )}
      </div>
    </>
  );
}
