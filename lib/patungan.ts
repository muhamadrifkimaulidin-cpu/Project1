import { rupiah, tanggal as fmtTanggal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/** Tagihan patungan (migrasi 008). Sisa & status lunas dihitung di v_patungan dari ganti yang tertaut. */
export type StatusPatungan = "terbuka" | "lunas" | "ditolak" | "dibatalkan";

export type Patungan = {
  id: string;
  kunci: string; // "transaksi:<id>" / "aset:<id>" belanja sumbernya
  penagihId: string;
  penagih: string;
  tertagihId: string;
  tertagih: string;
  jumlah: number;
  dibayar: number; // ganti aktif
  diproses: number; // ganti menunggu persetujuan
  sisa: number; // belum dibayar maupun diproses
  status: StatusPatungan;
  alasan: string | null;
  tanggung: string | null; // label belanja yang ditanggung saat menolak
};

export type Belanja = {
  kunci: string;
  tabel: "transaksi" | "aset";
  id: string;
  judul: string;
  tanggal: string;
  nilai: number;
  status: "menunggu" | "aktif" | "batal";
};

const KOLOM = "id, transaksi_id, aset_id, penagih_id, tertagih_id, jumlah, dibayar, diproses, sisa, status_efektif, alasan, tanggung_transaksi_id, tanggung_aset_id";

type Baris = {
  id: string;
  transaksi_id: string | null;
  aset_id: string | null;
  penagih_id: string;
  tertagih_id: string;
  jumlah: number;
  dibayar: number;
  diproses: number;
  sisa: number;
  status_efektif: StatusPatungan;
  alasan: string | null;
  tanggung_transaksi_id: string | null;
  tanggung_aset_id: string | null;
};

const kunciDari = (t: string | null, a: string | null) => (t ? `transaksi:${t}` : `aset:${a}`);

/** Judul singkat belanja untuk ditampilkan, mis. "Bahan uji racikan · buah" / "Aset Juicer". */
async function ambilBelanja(transaksi: string[], aset: string[]): Promise<Map<string, Belanja>> {
  const supabase = await createClient();
  const kosong = Promise.resolve({ data: [] as never[], error: null });
  const [t, a] = await Promise.all([
    transaksi.length
      ? supabase.from("transaksi").select("id, tanggal, jumlah, keterangan, status, kategori(nama)").in("id", transaksi)
      : kosong,
    aset.length ? supabase.from("aset").select("id, nama, tanggal_beli, harga_beli, status").in("id", aset) : kosong,
  ]);
  if (t.error) throw t.error;
  if (a.error) throw a.error;
  const peta = new Map<string, Belanja>();
  for (const r of t.data ?? []) {
    const kat = (r.kategori as unknown as { nama: string } | null)?.nama ?? "Belanja";
    peta.set(`transaksi:${r.id}`, {
      kunci: `transaksi:${r.id}`,
      tabel: "transaksi",
      id: r.id,
      judul: r.keterangan ? `${kat} · ${r.keterangan}` : kat,
      tanggal: r.tanggal,
      nilai: Number(r.jumlah),
      status: r.status,
    });
  }
  for (const r of a.data ?? []) {
    peta.set(`aset:${r.id}`, {
      kunci: `aset:${r.id}`,
      tabel: "aset",
      id: r.id,
      judul: `Aset ${r.nama}`,
      tanggal: r.tanggal_beli,
      nilai: Number(r.harga_beli),
      status: r.status,
    });
  }
  return peta;
}

async function susun(rows: Baris[]): Promise<{ daftar: Patungan[]; belanja: Map<string, Belanja> }> {
  const supabase = await createClient();
  const trx = new Set<string>();
  const aset = new Set<string>();
  for (const r of rows) {
    if (r.transaksi_id) trx.add(r.transaksi_id);
    if (r.aset_id) aset.add(r.aset_id);
    if (r.tanggung_transaksi_id) trx.add(r.tanggung_transaksi_id);
    if (r.tanggung_aset_id) aset.add(r.tanggung_aset_id);
  }
  const [profil, belanja] = await Promise.all([supabase.from("profil").select("id, nama"), ambilBelanja([...trx], [...aset])]);
  if (profil.error) throw profil.error;
  const nama = new Map((profil.data ?? []).map((p) => [p.id as string, p.nama as string]));
  const n = (id: string) => nama.get(id) ?? "?";
  const daftar = rows.map((r) => {
    const tg = r.tanggung_transaksi_id || r.tanggung_aset_id ? belanja.get(kunciDari(r.tanggung_transaksi_id, r.tanggung_aset_id)) : null;
    return {
      id: r.id,
      kunci: kunciDari(r.transaksi_id, r.aset_id),
      penagihId: r.penagih_id,
      penagih: n(r.penagih_id),
      tertagihId: r.tertagih_id,
      tertagih: n(r.tertagih_id),
      jumlah: Number(r.jumlah),
      dibayar: Number(r.dibayar),
      diproses: Number(r.diproses),
      sisa: Number(r.sisa),
      status: r.status_efektif,
      alasan: r.alasan,
      tanggung: tg ? `${tg.judul} ${rupiah(tg.nilai)} (${fmtTanggal(tg.tanggal)})` : null,
    };
  });
  return { daftar, belanja };
}

/** Patungan (selain yang dibatalkan) untuk belanja-belanja di kartu riwayat. Kunci = "transaksi:<id>" / "aset:<id>". */
export async function ambilPatunganPerBelanja(transaksi: string[], aset: string[]): Promise<Map<string, Patungan[]>> {
  const hasil = new Map<string, Patungan[]>();
  if (!transaksi.length && !aset.length) return hasil;
  const supabase = await createClient();
  const atau = [
    transaksi.length ? `transaksi_id.in.(${transaksi.join(",")})` : null,
    aset.length ? `aset_id.in.(${aset.join(",")})` : null,
  ].filter(Boolean);
  const { data, error } = await supabase
    .from("v_patungan")
    .select(KOLOM)
    .or(atau.join(","))
    .neq("status", "dibatalkan")
    .order("dibuat_pada");
  if (error) throw error;
  const { daftar } = await susun((data ?? []) as Baris[]);
  for (const p of daftar) hasil.set(p.kunci, [...(hasil.get(p.kunci) ?? []), p]);
  return hasil;
}

export type TagihanSaya = Patungan & { belanja: Belanja };
export type PiutangSaya = { belanja: Belanja; patungan: Patungan[] };

/**
 * Beranda: tagihan yang harus saya bayar (terbuka, masih ada sisa atau sedang diproses) dan
 * belanja saya yang patungannya belum semua lunas (ditampilkan semua orangnya, termasuk yang lunas).
 */
export async function ambilPatunganBeranda(userId: string): Promise<{ tagihan: TagihanSaya[]; piutang: PiutangSaya[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_patungan")
    .select(KOLOM)
    .or(`penagih_id.eq.${userId},tertagih_id.eq.${userId}`)
    .neq("status", "dibatalkan")
    .order("dibuat_pada");
  if (error) throw error;
  const { daftar, belanja } = await susun((data ?? []) as Baris[]);

  const tagihan = daftar
    .filter((p) => p.tertagihId === userId && p.status === "terbuka")
    .flatMap((p) => (belanja.has(p.kunci) ? [{ ...p, belanja: belanja.get(p.kunci)! }] : []));

  const kunciTerbuka = new Set(daftar.filter((p) => p.penagihId === userId && p.status === "terbuka").map((p) => p.kunci));
  const piutang = [...kunciTerbuka].flatMap((k) =>
    belanja.has(k) ? [{ belanja: belanja.get(k)!, patungan: daftar.filter((p) => p.kunci === k) }] : [],
  );
  return { tagihan, piutang };
}

/** Belanja uang pribadi (modal) saya yang belum batal: pilihan "menanggung belanja lain" saat menolak. */
export async function ambilBelanjaPribadiSaya(userId: string): Promise<{ kunci: string; label: string }[]> {
  const supabase = await createClient();
  const [t, a] = await Promise.all([
    supabase
      .from("transaksi")
      .select("id, tanggal, jumlah, keterangan, kategori(nama)")
      .eq("dibayar_owner_id", userId)
      .eq("klaim", "modal")
      .neq("status", "batal")
      .order("tanggal", { ascending: false })
      .limit(30),
    supabase
      .from("aset")
      .select("id, nama, tanggal_beli, harga_beli")
      .eq("dibayar_owner_id", userId)
      .eq("sumber", "beli_owner")
      .neq("status", "batal")
      .order("tanggal_beli", { ascending: false })
      .limit(10),
  ]);
  if (t.error) throw t.error;
  if (a.error) throw a.error;
  return [
    ...(t.data ?? []).map((r) => {
      const kat = (r.kategori as unknown as { nama: string } | null)?.nama ?? "Belanja";
      return {
        kunci: `transaksi:${r.id}`,
        label: `${fmtTanggal(r.tanggal)} · ${r.keterangan ? `${kat} · ${r.keterangan}` : kat} · ${rupiah(r.jumlah)}`,
      };
    }),
    ...(a.data ?? []).map((r) => ({
      kunci: `aset:${r.id}`,
      label: `${fmtTanggal(r.tanggal_beli)} · Aset ${r.nama} · ${rupiah(r.harga_beli)}`,
    })),
  ];
}
