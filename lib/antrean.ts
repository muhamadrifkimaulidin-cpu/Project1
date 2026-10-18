import { ambilCatatan, namaAsetTertaut, type TabelCatatan } from "@/lib/riwayat";
import { createClient } from "@/lib/supabase/server";
import { tanggal as fmtTanggal } from "@/lib/format";

export type Tabel = "transaksi" | "aset" | "kontribusi" | "distribusi" | "rnd_catatan" | "pengajuan_batal";

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
 * Pengajuan batal: boleh diputuskan owner mana pun selain pengaju (policy owner_putuskan_batal).
 */
export async function ambilAntrean(userId: string): Promise<{ bolehSaya: ItemAntrean[]; milikSaya: ItemAntrean[] }> {
  const supabase = await createClient();

  const [profil, trx, aset, kontribusi, distribusi, rnd, ajuan] = await Promise.all([
    supabase.from("profil").select("id, nama"),
    supabase
      .from("transaksi")
      .select("id, tanggal, jenis, jumlah, metode, sumber_dana, dibayar_owner_id, klaim, keterangan, bukti_path, dicatat_oleh, dibuat_pada, kategori(nama), aset(nama)")
      .eq("status", "menunggu"),
    supabase
      .from("aset")
      .select("id, nama, tanggal_beli, harga_beli, umur_bulan, sumber, dibayar_owner_id, lokasi, foto_path, bukti_path, dicatat_oleh, dibuat_pada")
      .eq("status", "menunggu")
      .is("transaksi_id", null), // aset yang ditautkan ke transaksi ikut keputusan transaksinya
    supabase
      .from("kontribusi")
      .select("id, tanggal, jumlah, metode, owner_id, keterangan, bukti_path, dicatat_oleh, dibuat_pada")
      .eq("status", "menunggu")
      .eq("bentuk", "setor_uang"),
    supabase
      .from("distribusi")
      .select("id, tanggal, jenis, jumlah, metode, owner_id, keterangan, bukti_path, dicatat_oleh, dibuat_pada")
      .eq("status", "menunggu"),
    supabase
      .from("rnd_catatan")
      .select("id, tanggal, isi, keputusan, lampiran_path, dicatat_oleh, dibuat_pada, rnd_ide(judul, jalur, subjenis)")
      .eq("status", "menunggu")
      .eq("jenis", "keputusan"),
    supabase
      .from("pengajuan_batal")
      .select("id, tabel, baris_id, alasan, diajukan_oleh, dibuat_pada")
      .eq("status", "menunggu"),
  ]);
  for (const r of [profil, trx, aset, kontribusi, distribusi, rnd, ajuan]) if (r.error) throw r.error;

  const nama = new Map((profil.data ?? []).map((p) => [p.id, p.nama as string]));
  const n = (id: string | null) => (id ? nama.get(id) ?? "?" : null);

  // Kumpulkan path foto dulu, minta signed URL sekaligus
  const paths = new Set<string>();
  const tambah = (p: string | null) => p && paths.add(p);
  trx.data!.forEach((r) => tambah(r.bukti_path));
  aset.data!.forEach((r) => (tambah(r.foto_path), tambah(r.bukti_path)));
  kontribusi.data!.forEach((r) => tambah(r.bukti_path));
  distribusi.data!.forEach((r) => tambah(r.bukti_path));
  rnd.data!.forEach((r) => tambah(r.lampiran_path));

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
    const asetTertaut = namaAsetTertaut(r.aset);
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
        ...(asetTertaut ? [["aset", `${asetTertaut} (ikut disetujui/ditolak bersama)`] as [string, string]] : []),
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
      rincian: [
        ["bentuk", "setor uang ke kas usaha (menambah porsi)"],
        ...(r.metode ? [["metode", r.metode] as [string, string]] : []),
      ],
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

  for (const r of rnd.data!) {
    const ide = r.rnd_ide as unknown as { judul: string } | null;
    items.push({
      tabel: "rnd_catatan",
      id: r.id,
      tanggal: r.tanggal,
      jumlah: 0, // keputusan R&D tidak bernilai uang
      judul: `R&D · ${r.keputusan === "diadopsi" ? "Diadopsi" : "Dihentikan"}: ${ide?.judul ?? "?"}`,
      pencatat: n(r.dicatat_oleh)!,
      pemilikUang: null,
      rincian: [["keputusan", r.keputusan === "diadopsi" ? "diadopsi (dipakai)" : "dihentikan"]],
      keterangan: r.isi,
      foto: foto(["lampiran", r.lampiran_path]),
      setorBarang: false,
      dibuatPada: r.dibuat_pada,
      milik: r.dicatat_oleh === userId,
    });
  }

  // Pengajuan batal: tampilkan catatan yang mau dibatalkan beserta buktinya
  if (ajuan.data!.length) {
    const ids: Partial<Record<TabelCatatan, string[]>> = {};
    for (const p of ajuan.data!) if (p.tabel !== "distribusi") (ids[p.tabel as TabelCatatan] ??= []).push(p.baris_id);
    const { items: target } = await ambilCatatan({ ids });
    const peta = new Map(target.map((t) => [`${t.tabel}:${t.id}`, t]));
    for (const p of ajuan.data!) {
      const t = peta.get(`${p.tabel}:${p.baris_id}`);
      if (!t) continue;
      items.push({
        tabel: "pengajuan_batal",
        id: p.id,
        tanggal: t.tanggal,
        jumlah: t.jumlah,
        judul: `Batalkan · ${t.judul}`,
        pencatat: n(p.diajukan_oleh)!,
        pemilikUang: t.pemilik,
        rincian: [
          ["alasan batal", p.alasan],
          ["catatan asli", `${fmtTanggal(t.tanggal)} · dicatat ${t.pencatat}${t.penyetuju ? ` · disetujui ${t.penyetuju}` : ""}`],
          ...t.rincian,
        ],
        keterangan: t.keterangan,
        foto: t.foto,
        setorBarang: false,
        dibuatPada: p.dibuat_pada,
        milik: p.diajukan_oleh === userId,
      });
    }
  }

  // Yang paling lama menunggu di atas
  items.sort((a, b) => a.dibuatPada.localeCompare(b.dibuatPada));
  return {
    bolehSaya: items.filter((i) => !i.milik),
    milikSaya: items.filter((i) => i.milik),
  };
}
