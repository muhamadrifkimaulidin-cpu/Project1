import { createClient } from "@/lib/supabase/server";

export type Tabel = "transaksi" | "aset" | "kontribusi" | "distribusi";

export type ItemAntrean = {
  tabel: Tabel;
  id: string;
  tanggal: string;
  jumlah: number;
  judul: string; // mis. "Pengeluaran · Bahan uji racikan"
  pencatat: string;
  pemilikUang: string | null; // owner yang uangnya dipakai / disetor, bila ada
  rincian: [string, string][]; // pasangan label–nilai untuk kartu
  keterangan: string | null;
  foto: { label: string; url: string }[];
  setorBarang: boolean; // nilai boleh diubah penyetuju (aset setor_barang)
  dibuatPada: string;
};

const BERLAKU_URL_DETIK = 60 * 60; // signed URL foto bukti berlaku 1 jam (CLAUDE.md §6.9)

const LABEL_SUMBER_ASET: Record<string, string> = {
  beli_kas: "dibeli dari kas usaha",
  beli_owner: "dibeli dengan uang pribadi",
  setor_barang: "barang pribadi disetor",
};
const LABEL_DISTRIBUSI: Record<string, string> = {
  penarikan_modal: "Penarikan modal",
  bagi_laba: "Bagi laba",
  pelunasan_talangan: "Pelunasan talangan",
};

/**
 * Semua catatan berstatus menunggu, dipisah menjadi:
 * - bolehSaya: boleh saya setujui (bukan catatan saya, bukan uang saya) — sama dengan policy owner_setujui_*
 * - milikSaya: catatan/uang saya yang menunggu owner lain
 * Kontribusi otomatis (dari transaksi/aset) tidak ditampilkan terpisah: disetujui lewat sumbernya.
 */
export async function ambilAntrean(userId: string): Promise<{ bolehSaya: ItemAntrean[]; milikSaya: ItemAntrean[] }> {
  const supabase = await createClient();

  const [profil, trx, aset, kontribusi, distribusi] = await Promise.all([
    supabase.from("profil").select("id, nama"),
    supabase
      .from("transaksi")
      .select("id, tanggal, jenis, jumlah, metode, sumber_dana, dibayar_owner_id, klaim, keterangan, bukti_path, dicatat_oleh, dibuat_pada, kategori(nama)")
      .eq("status", "menunggu"),
    supabase
      .from("aset")
      .select("id, nama, tanggal_beli, harga_beli, umur_bulan, sumber, dibayar_owner_id, lokasi, foto_path, bukti_path, dicatat_oleh, dibuat_pada")
      .eq("status", "menunggu"),
    supabase
      .from("kontribusi")
      .select("id, tanggal, jumlah, owner_id, keterangan, bukti_path, dicatat_oleh, dibuat_pada")
      .eq("status", "menunggu")
      .eq("bentuk", "setor_uang"),
    supabase
      .from("distribusi")
      .select("id, tanggal, jenis, jumlah, metode, owner_id, keterangan, bukti_path, dicatat_oleh, dibuat_pada")
      .eq("status", "menunggu"),
  ]);
  for (const r of [profil, trx, aset, kontribusi, distribusi]) if (r.error) throw r.error;

  const nama = new Map((profil.data ?? []).map((p) => [p.id, p.nama as string]));
  const n = (id: string | null) => (id ? nama.get(id) ?? "?" : null);

  // Kumpulkan path foto dulu, minta signed URL sekaligus
  const paths = new Set<string>();
  const tambah = (p: string | null) => p && paths.add(p);
  trx.data!.forEach((r) => tambah(r.bukti_path));
  aset.data!.forEach((r) => (tambah(r.foto_path), tambah(r.bukti_path)));
  kontribusi.data!.forEach((r) => tambah(r.bukti_path));
  distribusi.data!.forEach((r) => tambah(r.bukti_path));

  const url = new Map<string, string>();
  if (paths.size) {
    const { data, error } = await supabase.storage.from("bukti").createSignedUrls([...paths], BERLAKU_URL_DETIK);
    if (error) throw error;
    data.forEach((d) => d.path && d.signedUrl && url.set(d.path, d.signedUrl));
  }
  const foto = (...xs: [string, string | null][]) =>
    xs.flatMap(([label, p]) => (p && url.has(p) ? [{ label, url: url.get(p)! }] : []));

  const items: (ItemAntrean & { milik: boolean })[] = [];

  for (const r of trx.data!) {
    const kat = (r.kategori as unknown as { nama: string } | null)?.nama ?? "?";
    items.push({
      tabel: "transaksi",
      id: r.id,
      tanggal: r.tanggal,
      jumlah: Number(r.jumlah),
      judul: `${r.jenis === "pengeluaran" ? "Pengeluaran" : "Pemasukan"} · ${kat}`,
      pencatat: n(r.dicatat_oleh)!,
      pemilikUang: n(r.dibayar_owner_id),
      rincian: [
        ["metode", r.metode],
        [
          "sumber dana",
          r.sumber_dana === "owner"
            ? `uang pribadi ${n(r.dibayar_owner_id)} · ${r.klaim === "modal" ? "modal (menambah porsi)" : "talangan (utang usaha)"}`
            : "kas usaha",
        ],
      ],
      keterangan: r.keterangan,
      foto: foto(["nota", r.bukti_path]),
      setorBarang: false,
      dibuatPada: r.dibuat_pada,
      milik: r.dicatat_oleh === userId || r.dibayar_owner_id === userId,
    });
  }

  for (const r of aset.data!) {
    items.push({
      tabel: "aset",
      id: r.id,
      tanggal: r.tanggal_beli,
      jumlah: Number(r.harga_beli),
      judul: `Aset · ${r.nama}`,
      pencatat: n(r.dicatat_oleh)!,
      pemilikUang: n(r.dibayar_owner_id),
      rincian: [
        ["asal", `${LABEL_SUMBER_ASET[r.sumber] ?? r.sumber}${r.dibayar_owner_id ? ` (${n(r.dibayar_owner_id)})` : ""}`],
        ["umur", `${r.umur_bulan} bulan`],
        ...(r.lokasi ? [["lokasi", r.lokasi] as [string, string]] : []),
      ],
      keterangan: null,
      foto: foto(["barang", r.foto_path], ["nota", r.bukti_path]),
      setorBarang: r.sumber === "setor_barang",
      dibuatPada: r.dibuat_pada,
      milik: r.dicatat_oleh === userId || r.dibayar_owner_id === userId,
    });
  }

  for (const r of kontribusi.data!) {
    items.push({
      tabel: "kontribusi",
      id: r.id,
      tanggal: r.tanggal,
      jumlah: Number(r.jumlah),
      judul: `Setor uang · ${n(r.owner_id)}`,
      pencatat: n(r.dicatat_oleh)!,
      pemilikUang: n(r.owner_id),
      rincian: [["bentuk", "setor uang ke kas usaha (menambah porsi)"]],
      keterangan: r.keterangan,
      foto: foto(["bukti transfer", r.bukti_path]),
      setorBarang: false,
      dibuatPada: r.dibuat_pada,
      milik: r.dicatat_oleh === userId || r.owner_id === userId,
    });
  }

  for (const r of distribusi.data!) {
    items.push({
      tabel: "distribusi",
      id: r.id,
      tanggal: r.tanggal,
      jumlah: Number(r.jumlah),
      judul: `${LABEL_DISTRIBUSI[r.jenis] ?? r.jenis} · ${n(r.owner_id)}`,
      pencatat: n(r.dicatat_oleh)!,
      pemilikUang: n(r.owner_id),
      rincian: [["metode", r.metode]],
      keterangan: r.keterangan,
      foto: foto(["bukti", r.bukti_path]),
      setorBarang: false,
      dibuatPada: r.dibuat_pada,
      milik: r.dicatat_oleh === userId || r.owner_id === userId,
    });
  }

  // Yang paling lama menunggu di atas
  items.sort((a, b) => a.dibuatPada.localeCompare(b.dibuatPada));
  return {
    bolehSaya: items.filter((i) => !i.milik),
    milikSaya: items.filter((i) => i.milik),
  };
}
