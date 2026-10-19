import { rupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export type TabelCatatan = "transaksi" | "aset" | "kontribusi" | "ganti_modal";
export type StatusCatatan = "menunggu" | "aktif" | "batal";
export type JenisRiwayat = "transaksi" | "aset" | "setor" | "ganti";

export type Filter = {
  status: StatusCatatan | null;
  jenis: JenisRiwayat | null;
  owner: string | null; // pencatat atau pemilik uang
  kategori: string | null; // hanya transaksi
};

export type PengajuanTerbuka = { id: string; alasan: string; olehId: string; oleh: string };

/** Penggantian antar-owner atas satu belanja yang dibayar uang pribadi (migrasi 007). */
export type InfoGanti = {
  pembayarId: string;
  pembayar: string;
  total: number;
  diganti: { nama: string; jumlah: number; status: "menunggu" | "aktif" }[];
  sisa: number; // belum diganti (aktif + menunggu dihitung terpakai)
};

export type ItemRiwayat = {
  tabel: TabelCatatan;
  id: string;
  tanggal: string;
  jumlah: number;
  judul: string;
  rincian: [string, string][];
  keterangan: string | null;
  status: StatusCatatan;
  pencatatId: string;
  pencatat: string;
  pemilikId: string | null;
  pemilik: string | null;
  penyetuju: string | null;
  alasanBatal: string | null;
  foto: { label: string; url: string }[];
  adaBukti: boolean;
  ikutTransaksi: boolean; // aset yang mengikuti status transaksi "Pembelian aset"-nya (migrasi 005)
  ganti: InfoGanti | null; // hanya belanja uang pribadi (modal) yang aktif
  pengajuan: PengajuanTerbuka | null;
  dibuatPada: string;
};

export const BATAS_PER_JENIS = 100;

/** Nama aset yang menautkan transaksi (embed aset(nama): array karena relasi satu-ke-banyak di PostgREST). */
export function namaAsetTertaut(x: unknown): string | null {
  const a = (Array.isArray(x) ? x[0] : x) as { nama: string } | undefined | null;
  return a?.nama ?? null;
}
const BERLAKU_URL_DETIK = 60 * 60; // signed URL berlaku 1 jam (CLAUDE.md §6.9)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LABEL_SUMBER_ASET: Record<string, string> = {
  beli_kas: "dibeli dari kas usaha",
  beli_owner: "dibeli dengan uang pribadi",
  setor_barang: "barang pribadi disetor",
};

/** Baca filter dari searchParams; nilai yang tidak dikenal diabaikan (juga mencegah suntikan ke filter PostgREST). */
export function bacaFilter(sp: Record<string, string | string[] | undefined>): Filter {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const status = s("status");
  const jenis = s("jenis");
  const owner = s("owner");
  const kategori = s("kategori");
  return {
    status: status === "menunggu" || status === "aktif" || status === "batal" ? status : null,
    jenis: jenis === "transaksi" || jenis === "aset" || jenis === "setor" || jenis === "ganti" ? jenis : null,
    owner: owner && UUID.test(owner) ? owner : null,
    kategori: kategori && UUID.test(kategori) ? kategori : null,
  };
}

/**
 * Catatan transaksi, aset, dan setor uang (kontribusi otomatis tidak ditampilkan terpisah:
 * ia mengikuti transaksi/asetnya). Tiap jenis dibatasi BATAS_PER_JENIS terbaru.
 * `ids`: ambil catatan tertentu saja (dipakai antrean pengajuan batal).
 */
export async function ambilCatatan(opsi: {
  filter?: Filter;
  ids?: Partial<Record<TabelCatatan, string[]>>;
}): Promise<{ items: ItemRiwayat[]; terpotong: boolean }> {
  const supabase = await createClient();
  const f = opsi.filter ?? { status: null, jenis: null, owner: null, kategori: null };
  const ids = opsi.ids;
  const perlu = (t: TabelCatatan) => {
    if (ids) return (ids[t]?.length ?? 0) > 0;
    if (f.kategori && t !== "transaksi") return false;
    if (!f.jenis) return true;
    return ({ setor: "kontribusi", ganti: "ganti_modal" } as Record<string, string>)[f.jenis] === t || f.jenis === t;
  };

  const kosong = Promise.resolve({ data: [] as never[], error: null });
  const urut = { ascending: false } as const;
  const milik = (kolomPemilik: string) => `dicatat_oleh.eq.${f.owner},${kolomPemilik}.eq.${f.owner}`;

  const qTrx = () => {
    let q = supabase
      .from("transaksi")
      .select("id, tanggal, jenis, jumlah, metode, sumber_dana, dibayar_owner_id, klaim, keterangan, bukti_path, status, dicatat_oleh, disetujui_oleh, alasan_batal, dibuat_pada, kategori(nama), rnd_ide(judul), aset(nama)");
    if (ids) return q.in("id", ids.transaksi ?? []);
    if (f.status) q = q.eq("status", f.status);
    if (f.owner) q = q.or(milik("dibayar_owner_id"));
    if (f.kategori) q = q.eq("kategori_id", f.kategori);
    return q.order("tanggal", urut).order("dibuat_pada", urut).limit(BATAS_PER_JENIS);
  };
  const qAset = () => {
    let q = supabase
      .from("aset")
      .select("id, nama, tanggal_beli, harga_beli, umur_bulan, sumber, dibayar_owner_id, lokasi, foto_path, bukti_path, transaksi_id, status, dicatat_oleh, disetujui_oleh, alasan_batal, dibuat_pada");
    if (ids) return q.in("id", ids.aset ?? []);
    if (f.status) q = q.eq("status", f.status);
    if (f.owner) q = q.or(milik("dibayar_owner_id"));
    return q.order("tanggal_beli", urut).order("dibuat_pada", urut).limit(BATAS_PER_JENIS);
  };
  const qSetor = () => {
    let q = supabase
      .from("kontribusi")
      .select("id, tanggal, jumlah, metode, owner_id, keterangan, bukti_path, status, dicatat_oleh, disetujui_oleh, alasan_batal, dibuat_pada")
      .eq("bentuk", "setor_uang");
    if (ids) return q.in("id", ids.kontribusi ?? []);
    if (f.status) q = q.eq("status", f.status);
    if (f.owner) q = q.or(milik("owner_id"));
    return q.order("tanggal", urut).order("dibuat_pada", urut).limit(BATAS_PER_JENIS);
  };

  const qGanti = () => {
    let q = supabase
      .from("ganti_modal")
      .select("id, tanggal, penerima_id, pengganti_id, jumlah, transaksi_id, aset_id, metode, keterangan, bukti_path, status, dicatat_oleh, disetujui_oleh, alasan_batal, dibuat_pada, transaksi(tanggal, jumlah, kategori(nama)), aset(nama, harga_beli)");
    if (ids) return q.in("id", ids.ganti_modal ?? []);
    if (f.status) q = q.eq("status", f.status);
    if (f.owner) q = q.or(`dicatat_oleh.eq.${f.owner},penerima_id.eq.${f.owner},pengganti_id.eq.${f.owner}`);
    return q.order("tanggal", urut).order("dibuat_pada", urut).limit(BATAS_PER_JENIS);
  };

  const [profil, trx, aset, kontribusi, gantiRows, gantiTerpakai, pengajuan] = await Promise.all([
    supabase.from("profil").select("id, nama"),
    perlu("transaksi") ? qTrx() : kosong,
    perlu("aset") ? qAset() : kosong,
    perlu("kontribusi") ? qSetor() : kosong,
    perlu("ganti_modal") ? qGanti() : kosong,
    // semua ganti yang masih berlaku, untuk ringkasan "sudah diganti / sisa" di kartu belanja
    supabase.from("ganti_modal").select("transaksi_id, aset_id, pengganti_id, jumlah, status").in("status", ["menunggu", "aktif"]),
    supabase.from("pengajuan_batal").select("id, tabel, baris_id, alasan, diajukan_oleh").eq("status", "menunggu"),
  ]);
  for (const r of [profil, trx, aset, kontribusi, gantiRows, gantiTerpakai, pengajuan]) if (r.error) throw r.error;

  const nama = new Map((profil.data ?? []).map((p) => [p.id as string, p.nama as string]));
  const n = (id: string | null) => (id ? nama.get(id) ?? "?" : null);
  const ajuan = new Map(
    (pengajuan.data ?? []).map((p) => [
      `${p.tabel}:${p.baris_id}`,
      { id: p.id, alasan: p.alasan, olehId: p.diajukan_oleh, oleh: n(p.diajukan_oleh)! } as PengajuanTerbuka,
    ]),
  );

  const paths = new Set<string>();
  const tambah = (p: string | null) => p && paths.add(p);
  trx.data!.forEach((r) => tambah(r.bukti_path));
  aset.data!.forEach((r) => (tambah(r.foto_path), tambah(r.bukti_path)));
  kontribusi.data!.forEach((r) => tambah(r.bukti_path));
  gantiRows.data!.forEach((r) => tambah(r.bukti_path));
  const url = new Map<string, string>();
  if (paths.size) {
    const { data, error } = await supabase.storage.from("bukti").createSignedUrls([...paths], BERLAKU_URL_DETIK);
    if (error) throw error;
    data.forEach((d) => d.path && d.signedUrl && url.set(d.path, d.signedUrl));
  }
  const foto = (...xs: [string, string | null][]) =>
    xs.flatMap(([label, p]) => (p && url.has(p) ? [{ label, url: url.get(p)! }] : []));

  // Ringkasan ganti per belanja: kunci "transaksi:<id>" / "aset:<id>"
  const gantiPer = new Map<string, InfoGanti["diganti"]>();
  for (const g of gantiTerpakai.data ?? []) {
    const k = g.transaksi_id ? `transaksi:${g.transaksi_id}` : `aset:${g.aset_id}`;
    const daftar = gantiPer.get(k) ?? [];
    daftar.push({ nama: n(g.pengganti_id)!, jumlah: Number(g.jumlah), status: g.status });
    gantiPer.set(k, daftar);
  }
  const infoGanti = (k: string, pembayarId: string | null, total: number, aktif: boolean, modal: boolean): InfoGanti | null => {
    if (!pembayarId || !aktif || !modal) return null;
    const diganti = gantiPer.get(k) ?? [];
    return { pembayarId, pembayar: n(pembayarId)!, total, diganti, sisa: total - diganti.reduce((a, d) => a + d.jumlah, 0) };
  };

  const items: ItemRiwayat[] = [];
  const umum = (t: TabelCatatan, r: { id: string; status: StatusCatatan; dicatat_oleh: string; disetujui_oleh: string | null; alasan_batal: string | null; dibuat_pada: string }) => ({
    tabel: t,
    id: r.id,
    status: r.status,
    pencatatId: r.dicatat_oleh,
    pencatat: n(r.dicatat_oleh)!,
    penyetuju: n(r.disetujui_oleh),
    alasanBatal: r.alasan_batal,
    pengajuan: ajuan.get(`${t}:${r.id}`) ?? null,
    dibuatPada: r.dibuat_pada,
  });

  for (const r of trx.data!) {
    const kat = (r.kategori as unknown as { nama: string } | null)?.nama ?? "?";
    const ide = (r.rnd_ide as unknown as { judul: string } | null)?.judul;
    const asetTertaut = namaAsetTertaut(r.aset);
    items.push({
      ...umum("transaksi", r),
      tanggal: r.tanggal,
      jumlah: Number(r.jumlah),
      judul: `${r.jenis === "pengeluaran" ? "Pengeluaran" : "Pemasukan"} · ${kat}`,
      rincian: [
        ["metode", r.metode],
        [
          "sumber dana",
          r.sumber_dana === "owner"
            ? `uang pribadi ${n(r.dibayar_owner_id)} · ${r.klaim === "modal" ? "modal (menambah porsi)" : "talangan (utang usaha)"}`
            : "kas usaha",
        ],
        ...(ide ? [["ide R&D", ide] as [string, string]] : []),
        ...(asetTertaut ? [["aset", asetTertaut] as [string, string]] : []),
      ],
      keterangan: r.keterangan,
      pemilikId: r.dibayar_owner_id,
      pemilik: n(r.dibayar_owner_id),
      foto: foto(["nota", r.bukti_path]),
      adaBukti: !!r.bukti_path,
      ikutTransaksi: false,
      ganti: infoGanti(`transaksi:${r.id}`, r.dibayar_owner_id, Number(r.jumlah), r.status === "aktif", r.klaim === "modal"),
    });
  }

  for (const r of aset.data!) {
    items.push({
      ...umum("aset", r),
      tanggal: r.tanggal_beli,
      jumlah: Number(r.harga_beli),
      judul: `Aset · ${r.nama}`,
      rincian: [
        ["asal", `${LABEL_SUMBER_ASET[r.sumber] ?? r.sumber}${r.dibayar_owner_id ? ` (${n(r.dibayar_owner_id)})` : ""}`],
        ["umur", `${r.umur_bulan} bulan`],
        ...(r.lokasi ? [["lokasi", r.lokasi] as [string, string]] : []),
        ...(r.transaksi_id ? [["kas", "ikut pengeluaran \"Pembelian aset\"-nya"] as [string, string]] : []),
      ],
      keterangan: null,
      pemilikId: r.dibayar_owner_id,
      pemilik: n(r.dibayar_owner_id),
      foto: foto(["barang", r.foto_path], ["nota", r.bukti_path]),
      // barang setoran tidak punya nota: foto barangnya dihitung sebagai bukti
      adaBukti: !!r.bukti_path || (r.sumber === "setor_barang" && !!r.foto_path),
      ikutTransaksi: !!r.transaksi_id,
      ganti: infoGanti(`aset:${r.id}`, r.dibayar_owner_id, Number(r.harga_beli), r.status === "aktif", r.sumber === "beli_owner"),
    });
  }

  for (const r of kontribusi.data!) {
    items.push({
      ...umum("kontribusi", r),
      tanggal: r.tanggal,
      jumlah: Number(r.jumlah),
      judul: `Setor uang · ${n(r.owner_id)}`,
      rincian: [
        ["bentuk", "setor uang ke kas usaha (menambah porsi)"],
        ...(r.metode ? [["metode", r.metode] as [string, string]] : []),
      ],
      keterangan: r.keterangan,
      pemilikId: r.owner_id,
      pemilik: n(r.owner_id),
      foto: foto(["bukti transfer", r.bukti_path]),
      adaBukti: !!r.bukti_path,
      ikutTransaksi: false,
      ganti: null,
    });
  }

  for (const r of gantiRows.data!) {
    const t = r.transaksi as unknown as { tanggal: string; jumlah: number; kategori: { nama: string } | null } | null;
    const a = r.aset as unknown as { nama: string; harga_beli: number } | null;
    const untuk = t
      ? `${t.kategori?.nama ?? "belanja"} ${rupiah(t.jumlah)} (${t.tanggal})`
      : `aset ${a?.nama ?? "?"} ${rupiah(a?.harga_beli)}`;
    items.push({
      ...umum("ganti_modal", r),
      tanggal: r.tanggal,
      jumlah: Number(r.jumlah),
      judul: `Ganti · ${n(r.pengganti_id)} → ${n(r.penerima_id)}`,
      rincian: [
        ["untuk", untuk],
        ["metode", r.metode],
        ["efek", `modal ${n(r.pengganti_id)} +, modal ${n(r.penerima_id)} − (kas tetap)`],
      ],
      keterangan: r.keterangan,
      pemilikId: r.pengganti_id,
      pemilik: n(r.pengganti_id),
      foto: foto(["bukti transfer", r.bukti_path]),
      adaBukti: !!r.bukti_path,
      ikutTransaksi: false,
      ganti: null,
    });
  }

  items.sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.dibuatPada.localeCompare(a.dibuatPada));
  const terpotong = [trx, aset, kontribusi, gantiRows].some((r) => (r.data?.length ?? 0) >= BATAS_PER_JENIS);
  return { items, terpotong };
}
