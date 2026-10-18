import { HalamanSegera } from "@/components/halaman-segera";

export default function Page() {
  return (
    <HalamanSegera
      judul="BERANDA"
      lead="Ringkasan modal dan kas usaha, sama untuk ketiga owner."
      isi={[
        "Kartu porsi kepemilikan tiga owner",
        "Saldo kas usaha",
        "Jumlah item menunggu persetujuan saya",
        "Total biaya pra-operasi",
      ]}
    />
  );
}
