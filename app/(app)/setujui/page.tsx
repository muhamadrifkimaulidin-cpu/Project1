import { HalamanSegera } from "@/components/halaman-segera";

export default function Page() {
  return (
    <HalamanSegera
      judul="SETUJUI"
      lead="Catatan owner lain yang menunggu persetujuan Anda, lengkap dengan foto bukti."
      isi={["Antrean menunggu (bukan catatan/uang saya)", "Setujui / Tolak dengan alasan", "Nilai setor barang disepakati saat setuju"]}
    />
  );
}
