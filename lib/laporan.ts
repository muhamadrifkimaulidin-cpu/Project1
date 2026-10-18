import { createClient } from "@/lib/supabase/server";

export const BENTUK = ["setor_uang", "bayar_pengeluaran", "beli_aset", "setor_barang"] as const;
export type Bentuk = (typeof BENTUK)[number];
export const LABEL_BENTUK: Record<Bentuk, string> = {
  setor_uang: "Setor uang",
  bayar_pengeluaran: "Bayar pengeluaran",
  beli_aset: "Beli aset",
  setor_barang: "Setor barang",
};
export const LABEL_SUMBER_ASET: Record<string, string> = {
  beli_kas: "kas usaha",
  beli_owner: "uang owner",
  setor_barang: "barang owner",
};

const angka = (x: unknown) => Number(x ?? 0);

export type PorsiRinci = {
  ownerId: string;
  nama: string;
  perBentuk: Record<Bentuk, number>;
  totalKontribusi: number;
  totalPenarikan: number;
  modalBersih: number;
  persen: number | null;
};

/** Porsi (v_porsi_kepemilikan) + rincian kontribusi aktif per bentuk (v_kontribusi_per_bentuk). */
export async function ambilPorsiRinci(): Promise<PorsiRinci[]> {
  const supabase = await createClient();
  const [porsi, bentuk] = await Promise.all([
    supabase.from("v_porsi_kepemilikan").select("owner_id, nama, total_kontribusi, total_penarikan, modal_bersih, persen").order("nama"),
    supabase.from("v_kontribusi_per_bentuk").select("owner_id, bentuk, total"),
  ]);
  if (porsi.error) throw porsi.error;
  if (bentuk.error) throw bentuk.error;
  return (porsi.data ?? []).map((p) => {
    const perBentuk = Object.fromEntries(BENTUK.map((b) => [b, 0])) as Record<Bentuk, number>;
    for (const r of bentuk.data ?? []) if (r.owner_id === p.owner_id && r.bentuk in perBentuk) perBentuk[r.bentuk as Bentuk] = angka(r.total);
    return {
      ownerId: p.owner_id,
      nama: p.nama,
      perBentuk,
      totalKontribusi: angka(p.total_kontribusi),
      totalPenarikan: angka(p.total_penarikan),
      modalBersih: angka(p.modal_bersih),
      persen: p.persen === null ? null : angka(p.persen),
    };
  });
}

export async function ambilTalangan(): Promise<{ nama: string; sisa: number }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_talangan_owner").select("nama, sisa_talangan").order("nama");
  if (error) throw error;
  return (data ?? []).map((r) => ({ nama: r.nama, sisa: angka(r.sisa_talangan) }));
}

export type BiayaKategori = { kategori: string; kas: number; owner: number; total: number; catatan: number };

/** v_biaya_pra_operasi dipecah per kategori: dari kas usaha vs dibayar owner. Terbesar di atas. */
export async function ambilBiayaPraOperasiPerKategori(): Promise<BiayaKategori[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_biaya_pra_operasi").select("kategori, sumber_dana, jumlah_catatan, total");
  if (error) throw error;
  const peta = new Map<string, BiayaKategori>();
  for (const r of data ?? []) {
    const k = peta.get(r.kategori) ?? { kategori: r.kategori, kas: 0, owner: 0, total: 0, catatan: 0 };
    if (r.sumber_dana === "owner") k.owner += angka(r.total);
    else k.kas += angka(r.total);
    k.total += angka(r.total);
    k.catatan += angka(r.jumlah_catatan);
    peta.set(r.kategori, k);
  }
  return [...peta.values()].sort((a, b) => b.total - a.total);
}

export type AsetBuku = {
  id: string;
  nama: string;
  tanggalBeli: string;
  hargaBeli: number;
  umurBulan: number;
  bulanTerpakai: number;
  nilaiBuku: number;
  sumber: string;
  kondisi: string;
  lokasi: string | null;
};

/** v_nilai_buku_aset: aset aktif berkondisi baik/rusak, penyusutan garis lurus per bulan. */
export async function ambilNilaiBukuAset(): Promise<AsetBuku[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_nilai_buku_aset")
    .select("id, nama, tanggal_beli, harga_beli, umur_bulan, bulan_terpakai, nilai_buku, sumber, kondisi, lokasi")
    .order("tanggal_beli", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    nama: r.nama,
    tanggalBeli: r.tanggal_beli,
    hargaBeli: angka(r.harga_beli),
    umurBulan: angka(r.umur_bulan),
    bulanTerpakai: angka(r.bulan_terpakai),
    nilaiBuku: angka(r.nilai_buku),
    sumber: r.sumber,
    kondisi: r.kondisi,
    lokasi: r.lokasi,
  }));
}

export type TanpaBukti = {
  jenis: "Pengeluaran" | "Aset" | "Setor uang";
  tanggal: string;
  judul: string;
  jumlah: number;
  pencatat: string;
  status: "menunggu" | "aktif";
};

/** Catatan belum batal tanpa foto bukti — kriteria sama dengan hitungBelumAdaBukti() di beranda. */
export async function ambilTanpaBukti(): Promise<TanpaBukti[]> {
  const supabase = await createClient();
  const [profil, trx, aset, setor] = await Promise.all([
    supabase.from("profil").select("id, nama"),
    supabase
      .from("transaksi")
      .select("tanggal, jumlah, keterangan, status, dicatat_oleh, kategori(nama)")
      .eq("jenis", "pengeluaran")
      .is("bukti_path", null)
      .neq("status", "batal"),
    supabase
      .from("aset")
      .select("tanggal_beli, nama, harga_beli, status, dicatat_oleh")
      .is("bukti_path", null)
      .neq("status", "batal")
      .is("transaksi_id", null) // aset dari kas yang tertaut: buktinya dihitung di transaksinya
      .or("sumber.neq.setor_barang,foto_path.is.null"),
    supabase
      .from("kontribusi")
      .select("tanggal, jumlah, status, dicatat_oleh, owner_id")
      .eq("bentuk", "setor_uang")
      .is("bukti_path", null)
      .neq("status", "batal"),
  ]);
  for (const r of [profil, trx, aset, setor]) if (r.error) throw r.error;
  const nama = new Map((profil.data ?? []).map((p) => [p.id as string, p.nama as string]));
  const n = (id: string) => nama.get(id) ?? "?";

  const hasil: TanpaBukti[] = [
    ...trx.data!.map((r) => {
      const kat = (r.kategori as unknown as { nama: string } | null)?.nama ?? "?";
      return {
        jenis: "Pengeluaran" as const,
        tanggal: r.tanggal,
        judul: r.keterangan ? `${kat} · ${r.keterangan}` : kat,
        jumlah: angka(r.jumlah),
        pencatat: n(r.dicatat_oleh),
        status: r.status,
      };
    }),
    ...aset.data!.map((r) => ({
      jenis: "Aset" as const,
      tanggal: r.tanggal_beli,
      judul: r.nama,
      jumlah: angka(r.harga_beli),
      pencatat: n(r.dicatat_oleh),
      status: r.status,
    })),
    ...setor.data!.map((r) => ({
      jenis: "Setor uang" as const,
      tanggal: r.tanggal,
      judul: n(r.owner_id),
      jumlah: angka(r.jumlah),
      pencatat: n(r.dicatat_oleh),
      status: r.status,
    })),
  ];
  return hasil.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
}
