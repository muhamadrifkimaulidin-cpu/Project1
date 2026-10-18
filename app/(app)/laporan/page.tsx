import { HalamanSegera } from "@/components/halaman-segera";

export default function Page() {
  return (
    <HalamanSegera
      judul="LAPORAN"
      lead="Porsi, talangan, biaya pra-operasi, aset, dan catatan tanpa bukti — semua bisa diekspor CSV."
      isi={["Porsi + rincian per bentuk kontribusi", "Talangan per owner", "Biaya pra-operasi per kategori", "Aset + nilai buku", "Belum ada bukti", "Riwayat + batalkan"]}
    />
  );
}
