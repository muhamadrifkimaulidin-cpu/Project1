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
