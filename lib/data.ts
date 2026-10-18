import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

export type PorsiOwner = {
  owner_id: string;
  nama: string;
  total_kontribusi: number;
  total_penarikan: number;
  modal_bersih: number;
  persen: number | null; // null saat belum ada modal aktif sama sekali
};

/** Porsi kepemilikan berjalan (v_porsi_kepemilikan: hanya kontribusi & penarikan berstatus aktif). */
export async function ambilPorsi(): Promise<PorsiOwner[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_porsi_kepemilikan")
    .select("owner_id, nama, total_kontribusi, total_penarikan, modal_bersih, persen")
    .order("nama");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    total_kontribusi: Number(r.total_kontribusi),
    total_penarikan: Number(r.total_penarikan),
    modal_bersih: Number(r.modal_bersih),
    persen: r.persen === null ? null : Number(r.persen),
  }));
}

export async function ambilSaldoKas(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_saldo_kas").select("saldo_kas").single();
  if (error) throw error;
  return Number(data.saldo_kas);
}

/** Total biaya pra-operasi (R&D + persiapan), semua sumber dana. */
export async function ambilBiayaPraOperasi(): Promise<{ total: number; catatan: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_biaya_pra_operasi").select("total, jumlah_catatan");
  if (error) throw error;
  return (data ?? []).reduce(
    (a, r) => ({ total: a.total + Number(r.total), catatan: a.catatan + Number(r.jumlah_catatan) }),
    { total: 0, catatan: 0 },
  );
}

/**
 * Jumlah item menunggu yang BOLEH saya setujui: bukan catatan saya, bukan uang saya.
 * Kontribusi otomatis (bayar_pengeluaran/beli_aset/setor_barang) disetujui lewat transaksi/aset-nya,
 * jadi yang dihitung dari tabel kontribusi hanya setor_uang (sama dengan policy owner_setujui_kontribusi).
 */
export const hitungMenungguSaya = cache(async (userId: string): Promise<number> => {
  const supabase = await createClient();
  const bukanUangSaya = `dibayar_owner_id.is.null,dibayar_owner_id.neq.${userId}`;
  const hitung = (q: PromiseLike<{ count: number | null; error: unknown }>) =>
    Promise.resolve(q).then(({ count, error }) => {
      if (error) throw error;
      return count ?? 0;
    });

  const opsi = { count: "exact" as const, head: true };
  const jumlah = await Promise.all([
    hitung(
      supabase.from("transaksi").select("id", opsi)
        .eq("status", "menunggu").neq("dicatat_oleh", userId).or(bukanUangSaya),
    ),
    hitung(
      supabase.from("aset").select("id", opsi)
        .eq("status", "menunggu").neq("dicatat_oleh", userId).or(bukanUangSaya),
    ),
    hitung(
      supabase.from("kontribusi").select("id", opsi)
        .eq("status", "menunggu").eq("bentuk", "setor_uang")
        .neq("dicatat_oleh", userId).neq("owner_id", userId),
    ),
    hitung(
      supabase.from("distribusi").select("id", opsi)
        .eq("status", "menunggu").neq("dicatat_oleh", userId).neq("owner_id", userId),
    ),
    hitung(
      supabase.from("rnd_catatan").select("id", opsi)
        .eq("status", "menunggu").eq("jenis", "keputusan").neq("dicatat_oleh", userId),
    ),
  ]);
  return jumlah.reduce((a, b) => a + b, 0);
});

export type KategoriBaris = { id: string; nama: string; jenis: "pemasukan" | "pengeluaran"; fase: "pra_operasi" | "operasi" };

export async function ambilKategori(): Promise<KategoriBaris[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("kategori").select("id, nama, jenis, fase").order("nama");
  if (error) throw error;
  return data ?? [];
}

/** Tahap 1 hanya satu outlet; ambil yang pertama. */
export async function ambilOutletUtama(): Promise<{ id: string; nama: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("outlet").select("id, nama").order("nama").limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

/** Nama owner aktif selain saya (calon penyetuju). */
export async function ambilOwnerLain(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profil")
    .select("nama")
    .eq("peran", "owner")
    .eq("aktif", true)
    .neq("id", userId)
    .order("nama");
  if (error) throw error;
  return (data ?? []).map((p) => p.nama);
}

/**
 * Catatan yang belum punya foto bukti (aturan bisnis #5): pengeluaran, aset, dan setor uang
 * yang tidak dibatalkan. Kontribusi otomatis ikut transaksi/aset-nya, jadi tidak dihitung dua kali.
 */
export async function hitungBelumAdaBukti(): Promise<number> {
  const supabase = await createClient();
  const opsi = { count: "exact" as const, head: true };
  const hasil = await Promise.all([
    supabase.from("transaksi").select("id", opsi).eq("jenis", "pengeluaran").is("bukti_path", null).neq("status", "batal"),
    supabase.from("aset").select("id", opsi).is("bukti_path", null).neq("status", "batal"),
    supabase.from("kontribusi").select("id", opsi).eq("bentuk", "setor_uang").is("bukti_path", null).neq("status", "batal"),
  ]);
  return hasil.reduce((a, { count, error }) => {
    if (error) throw error;
    return a + (count ?? 0);
  }, 0);
}
