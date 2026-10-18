import type { Jalur, Tahap } from "@/lib/rnd-label";
import { createClient } from "@/lib/supabase/server";

export * from "@/lib/rnd-label";

export type IdeRingkas = {
  id: string;
  judul: string;
  jalur: Jalur;
  subjenis: string;
  tujuan: string | null;
  pic: string;
  tahap: Tahap;
  status: "aktif" | "batal";
  biaya_rnd: number;
  jumlah_catatan: number;
  jumlah_uji: number;
  terakhir: string | null;
  keputusan_menunggu: boolean;
};

async function petaNama() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profil").select("id, nama");
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id as string, p.nama as string]));
}

export async function ambilDaftarIde(): Promise<IdeRingkas[]> {
  const supabase = await createClient();
  const [nama, { data, error }] = await Promise.all([
    petaNama(),
    supabase
      .from("v_rnd_ide")
      .select("id, judul, jalur, subjenis, tujuan, pic_id, tahap, status, biaya_rnd, jumlah_catatan, jumlah_uji, terakhir, keputusan_menunggu, dibuat_pada")
      .eq("status", "aktif")
      .order("dibuat_pada", { ascending: false }),
  ]);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    pic: nama.get(r.pic_id) ?? "?",
    biaya_rnd: Number(r.biaya_rnd),
    jumlah_catatan: Number(r.jumlah_catatan),
    jumlah_uji: Number(r.jumlah_uji),
  }));
}

export type CatatanRnd = {
  id: string;
  tanggal: string;
  jenis: "progres" | "uji" | "keputusan";
  isi: string;
  keputusan: "diadopsi" | "dihentikan" | null;
  status: "menunggu" | "aktif" | "batal";
  pencatat: string;
  pencatatId: string;
  penyetuju: string | null;
  alasanBatal: string | null;
  lampiranUrl: string | null;
};

export async function ambilIde(id: string): Promise<{ ide: IdeRingkas & { pic_id: string }; catatan: CatatanRnd[] } | null> {
  const supabase = await createClient();
  const [nama, ide, cat] = await Promise.all([
    petaNama(),
    supabase
      .from("v_rnd_ide")
      .select("id, judul, jalur, subjenis, tujuan, pic_id, tahap, status, biaya_rnd, jumlah_catatan, jumlah_uji, terakhir, keputusan_menunggu")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("rnd_catatan")
      .select("id, tanggal, jenis, isi, keputusan, status, dicatat_oleh, disetujui_oleh, alasan_batal, lampiran_path, dibuat_pada")
      .eq("ide_id", id)
      .order("tanggal", { ascending: false })
      .order("dibuat_pada", { ascending: false }),
  ]);
  if (ide.error) throw ide.error;
  if (cat.error) throw cat.error;
  if (!ide.data) return null;

  const paths = (cat.data ?? []).map((c) => c.lampiran_path).filter((p): p is string => !!p);
  const url = new Map<string, string>();
  if (paths.length) {
    const { data, error } = await supabase.storage.from("bukti").createSignedUrls(paths, 60 * 60);
    if (error) throw error;
    data.forEach((d) => d.path && d.signedUrl && url.set(d.path, d.signedUrl));
  }

  const r = ide.data;
  return {
    ide: {
      ...r,
      pic: nama.get(r.pic_id) ?? "?",
      biaya_rnd: Number(r.biaya_rnd),
      jumlah_catatan: Number(r.jumlah_catatan),
      jumlah_uji: Number(r.jumlah_uji),
    },
    catatan: (cat.data ?? []).map((c) => ({
      id: c.id,
      tanggal: c.tanggal,
      jenis: c.jenis,
      isi: c.isi,
      keputusan: c.keputusan,
      status: c.status,
      pencatat: nama.get(c.dicatat_oleh) ?? "?",
      pencatatId: c.dicatat_oleh,
      penyetuju: c.disetujui_oleh ? nama.get(c.disetujui_oleh) ?? "?" : null,
      alasanBatal: c.alasan_batal,
      lampiranUrl: c.lampiran_path ? url.get(c.lampiran_path) ?? null : null,
    })),
  };
}

/** Daftar owner aktif (untuk pilihan PIC). */
export async function ambilOwner(): Promise<{ id: string; nama: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profil").select("id, nama").eq("peran", "owner").eq("aktif", true).order("nama");
  if (error) throw error;
  return data ?? [];
}

export type Bahan = {
  id: string;
  nama: string;
  satuan: "gram" | "ml" | "pcs";
  harga_beli: number;
  isi: number;
  harga_per_satuan: number;
  aktif: boolean;
  diperbarui_pada: string;
};

export async function ambilBahan(): Promise<Bahan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rnd_bahan")
    .select("id, nama, satuan, harga_beli, isi, harga_per_satuan, aktif, diperbarui_pada")
    .order("aktif", { ascending: false })
    .order("nama");
  if (error) throw error;
  return (data ?? []).map((b) => ({
    ...b,
    harga_beli: Number(b.harga_beli),
    isi: Number(b.isi),
    harga_per_satuan: Number(b.harga_per_satuan),
  }));
}

export type HasilUji = {
  catatanId: string;
  jumlahCup: number;
  biayaBatch: number;
  biayaPerCup: number | null; // harga saat uji (dibekukan)
  biayaPerCupKini: number | null; // resep sama x harga bahan terbaru
  skorRata: number | null;
  resep: { bahan: string; satuan: string; takaran: number; biaya: number }[];
  skor: { penilai: string; skor: number; komentar: string | null }[];
};

/** Hasil semua uji aktif satu ide: biaya per cup (saat uji & kini), resep, skor penilai. */
export async function ambilUjiIde(ideId: string): Promise<Map<string, HasilUji>> {
  const supabase = await createClient();
  const { data: uji, error } = await supabase
    .from("v_rnd_uji")
    .select("catatan_id, jumlah_cup, biaya_batch, biaya_per_cup, biaya_per_cup_kini, skor_rata")
    .eq("ide_id", ideId);
  if (error) throw error;
  const ids = (uji ?? []).map((u) => u.catatan_id as string);
  const hasil = new Map<string, HasilUji>();
  if (!ids.length) return hasil;

  const [resep, skor] = await Promise.all([
    supabase.from("rnd_resep").select("catatan_id, takaran, biaya, rnd_bahan(nama, satuan)").in("catatan_id", ids).order("dibuat_pada"),
    supabase.from("rnd_skor").select("catatan_id, penilai, skor, komentar").in("catatan_id", ids).order("dibuat_pada"),
  ]);
  if (resep.error) throw resep.error;
  if (skor.error) throw skor.error;

  const angka = (x: unknown) => (x === null || x === undefined ? null : Number(x));
  for (const u of uji!) {
    hasil.set(u.catatan_id, {
      catatanId: u.catatan_id,
      jumlahCup: Number(u.jumlah_cup),
      biayaBatch: Number(u.biaya_batch),
      biayaPerCup: angka(u.biaya_per_cup),
      biayaPerCupKini: angka(u.biaya_per_cup_kini),
      skorRata: angka(u.skor_rata),
      resep: [],
      skor: [],
    });
  }
  for (const r of resep.data ?? []) {
    const b = r.rnd_bahan as unknown as { nama: string; satuan: string } | null;
    hasil.get(r.catatan_id)?.resep.push({ bahan: b?.nama ?? "?", satuan: b?.satuan ?? "", takaran: Number(r.takaran), biaya: Number(r.biaya) });
  }
  for (const s of skor.data ?? []) {
    hasil.get(s.catatan_id)?.skor.push({ penilai: s.penilai, skor: s.skor, komentar: s.komentar });
  }
  return hasil;
}

/** Ide aktif yang belum diputuskan (untuk menautkan pengeluaran R&D). */
export async function ambilIdeTerbuka(): Promise<{ id: string; judul: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rnd_ide")
    .select("id, judul")
    .eq("status", "aktif")
    .in("tahap", ["ide", "diuji", "evaluasi"])
    .order("judul");
  if (error) throw error;
  return data ?? [];
}
