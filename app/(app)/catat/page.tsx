import { HalamanSegera } from "@/components/halaman-segera";

export default function Page() {
  return (
    <HalamanSegera
      judul="CATAT"
      lead="Satu kali catat: uang pribadi owner otomatis jadi kontribusi modal."
      isi={["Pengeluaran / pemasukan (boleh tanggal mundur)", "Aset", "Setor uang"]}
    />
  );
}
