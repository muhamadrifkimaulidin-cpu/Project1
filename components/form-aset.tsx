"use client";

import { InputUang } from "@/components/input-uang";
import { PilihFoto } from "@/components/pilih-foto";
import { PilihPatungan, simpanPatungan, totalPatungan, type IsianPatungan, type Owner } from "@/components/pilih-patungan";
import { useOnline } from "@/components/status-sinyal";
import { unggahBukti } from "@/lib/foto";
import { hariIniLokal, rupiah, tanggal as fmtTanggal } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Sumber = "beli_kas" | "beli_owner" | "setor_barang";
type Metode = "tunai" | "qris" | "transfer";
type Status = "aktif" | "menunggu";

// Sama dengan form transaksi (CLAUDE.md §4.2): pengeluaran kas di atas ini menunggu persetujuan
const BATAS_SETUJU_KAS = 500_000;
// Umur default penyusutan (CLAUDE.md §4.8)
const UMUR_DEFAULT = 36;

const ASAL: { v: Sumber; label: string; ket: string }[] = [
  { v: "beli_kas", label: "Kas usaha", ket: "Dibeli pakai uang usaha. Tidak mengubah porsi." },
  { v: "beli_owner", label: "Uang saya", ket: "Saya beli sendiri: harganya jadi modal saya (menambah porsi) setelah disetujui." },
  { v: "setor_barang", label: "Barang saya", ket: "Barang pribadi saya diserahkan ke usaha: nilainya disepakati penyetuju, lalu jadi modal saya." },
];

type Hasil = {
  nama: string;
  nilai: number;
  sumber: Sumber;
  status: Status;
  denganTransaksi: boolean;
  tanpaBukti: boolean;
  patungan: string | null;
  errorPatungan: string | null;
};

export function FormAset({
  outletId,
  userId,
  penyetuju,
  kategoriAsetId,
  ownerLain,
}: {
  outletId: string;
  userId: string;
  penyetuju: string[];
  kategoriAsetId: string | null; // kategori pengeluaran "Pembelian aset"
  ownerLain: Owner[]; // untuk minta patungan (aset dibeli uang saya)
}) {
  const router = useRouter();
  const online = useOnline();

  const [nama, setNama] = useState("");
  const [sumber, setSumber] = useState<Sumber>("beli_kas");
  const [tgl, setTgl] = useState("");
  const [hariIni, setHariIni] = useState("");
  const [nilai, setNilai] = useState<number | null>(null);
  const [umur, setUmur] = useState(String(UMUR_DEFAULT));
  const [lokasi, setLokasi] = useState("");
  const [catatKas, setCatatKas] = useState(!!kategoriAsetId);
  const [metode, setMetode] = useState<Metode>("tunai");
  const [fotoBarang, setFotoBarang] = useState<File | null>(null);
  const [fotoNota, setFotoNota] = useState<File | null>(null);
  const [mintaPatungan, setMintaPatungan] = useState(false);
  const [isiPatungan, setIsiPatungan] = useState<IsianPatungan>({});

  const [proses, setProses] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  // id stabil per isian: simpan ulang setelah sinyal putus tidak membuat aset/transaksi ganda
  const ids = useRef<{ aset: string; transaksi: string; fotoBarang: string } | null>(null);
  const idPatungan = useRef<Record<string, string> | null>(null);

  useEffect(() => {
    const t = hariIniLokal();
    setHariIni(t);
    setTgl(t);
  }, []);

  const denganTransaksi = sumber === "beli_kas" && catatKas && !!kategoriAsetId;
  const setor = sumber === "setor_barang";
  const akanMenunggu = sumber !== "beli_kas" || (denganTransaksi && (nilai ?? 0) > BATAS_SETUJU_KAS);

  const reset = () => {
    setNama("");
    setNilai(null);
    setUmur(String(UMUR_DEFAULT));
    setLokasi("");
    setFotoBarang(null);
    setFotoNota(null);
    setMintaPatungan(false);
    setIsiPatungan({});
    setHasil(null);
    setError(null);
    ids.current = null;
    idPatungan.current = null;
    window.scrollTo({ top: 0 });
  };

  const simpan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (proses) return;
    setError(null);
    if (!online) return setError("Tidak ada sinyal. Tidak ada yang disimpan — coba lagi setelah tersambung.");
    if (!nama.trim()) return setError("Isi nama barang.");
    if (!tgl) return setError("Isi tanggal.");
    if (tgl > hariIni) return setError("Tanggal tidak boleh di masa depan.");
    if (!nilai || nilai <= 0) return setError(setor ? "Isi nilai usulan lebih dari Rp0." : "Isi harga lebih dari Rp0.");
    const denganPatungan = sumber === "beli_owner" && mintaPatungan && totalPatungan(isiPatungan) > 0;
    if (denganPatungan && totalPatungan(isiPatungan) > nilai)
      return setError(`Patungan yang diminta (${rupiah(totalPatungan(isiPatungan))}) melebihi harga aset.`);
    const umurBulan = Number(umur);
    if (!Number.isInteger(umurBulan) || umurBulan <= 0) return setError("Umur pakai harus bilangan bulat lebih dari 0 bulan.");
    // Bukti: nota untuk barang yang dibeli; untuk barang setoran, foto barangnya
    const adaBukti = setor ? !!(fotoBarang || fotoNota) : !!fotoNota;
    if (!adaBukti) {
      const lanjut = window.confirm(
        `Belum ada ${setor ? "foto barang" : "foto nota"}. Catatan tetap disimpan tapi masuk daftar "belum ada bukti". Lanjut?`,
      );
      if (!lanjut) return;
    }

    const supabase = createClient();
    ids.current ??= { aset: crypto.randomUUID(), transaksi: crypto.randomUUID(), fotoBarang: crypto.randomUUID() };
    const id = ids.current;

    try {
      const notaPath = fotoNota ? await unggahBukti(supabase, "aset", tgl, id.aset, fotoNota, setProses) : null;
      const barangPath = fotoBarang ? await unggahBukti(supabase, "aset", tgl, id.fotoBarang, fotoBarang, setProses) : null;
      setProses("Menyimpan…");

      // 1. Pengeluaran kas "Pembelian aset" lebih dulu: aset menautkannya dan mengikuti statusnya
      if (denganTransaksi) {
        const { error: err } = await supabase.from("transaksi").insert({
          id: id.transaksi,
          outlet_id: outletId,
          tanggal: tgl,
          jenis: "pengeluaran",
          kategori_id: kategoriAsetId,
          jumlah: nilai,
          metode,
          sumber_dana: "kas_usaha",
          keterangan: `Pembelian aset: ${nama.trim()}`,
          bukti_path: notaPath, // nota yang sama dengan aset
        });
        // 23505 = sudah tersimpan di percobaan sebelumnya (id sama)
        if (err && err.code !== "23505") throw new Error(err.message);
      }

      // 2. Aset
      const { data, error: err } = await supabase
        .from("aset")
        .insert({
          id: id.aset,
          outlet_id: outletId,
          nama: nama.trim(),
          tanggal_beli: tgl,
          harga_beli: nilai,
          umur_bulan: umurBulan,
          sumber,
          dibayar_owner_id: sumber === "beli_kas" ? null : userId,
          transaksi_id: denganTransaksi ? id.transaksi : null,
          lokasi: lokasi.trim() || null,
          foto_path: barangPath,
          bukti_path: notaPath,
        })
        .select("status")
        .single<{ status: Status }>();
      let status = data?.status;
      if (err?.code === "23505") {
        const lama = await supabase.from("aset").select("status").eq("id", id.aset).single<{ status: Status }>();
        if (lama.error) throw new Error(lama.error.message);
        status = lama.data.status;
      } else if (err) {
        throw new Error(err.message);
      }

      let ringkasPatungan: string | null = null;
      let errorPatungan: string | null = null;
      if (denganPatungan) {
        idPatungan.current ??= Object.fromEntries(ownerLain.map((o) => [o.id, crypto.randomUUID()]));
        setProses("Meminta patungan…");
        try {
          await simpanPatungan(supabase, { aset_id: id.aset }, userId, isiPatungan, idPatungan.current);
          ringkasPatungan = ownerLain
            .filter((o) => (isiPatungan[o.id] ?? 0) > 0)
            .map((o) => `${o.nama} ${rupiah(isiPatungan[o.id])}`)
            .join(", ");
        } catch (x) {
          errorPatungan = x instanceof Error ? x.message : "gagal";
        }
      }

      setHasil({
        nama: nama.trim(),
        nilai,
        sumber,
        status: status!,
        denganTransaksi,
        tanpaBukti: !adaBukti,
        patungan: ringkasPatungan,
        errorPatungan,
      });
      router.refresh();
      window.scrollTo({ top: 0 });
    } catch (x) {
      setError(x instanceof Error ? x.message : "Gagal menyimpan.");
    } finally {
      setProses(null);
    }
  };

  if (hasil) {
    const siapa = penyetuju.join(" atau ");
    return (
      <div className="fs">
        <div className="fs-body">
          <div className={`notice${hasil.status === "menunggu" ? " warn" : ""}`}>
            <b>
              Aset {hasil.nama} {rupiah(hasil.nilai)} tersimpan
              {hasil.denganTransaksi ? " beserta pengeluaran kas \"Pembelian aset\"" : ""}.
            </b>
            <br />
            {hasil.status === "aktif"
              ? hasil.denganTransaksi
                ? "Status aktif — pengeluaran langsung dihitung di saldo kas."
                : "Status aktif."
              : hasil.sumber === "setor_barang"
                ? `Status menunggu — ${siapa} menetapkan nilai yang disepakati, lalu nilainya jadi modalmu.`
                : hasil.sumber === "beli_owner"
                  ? `Status menunggu — jadi modalmu setelah disetujui ${siapa}.`
                  : `Status menunggu — pengeluaran kas di atas ${rupiah(BATAS_SETUJU_KAS)} perlu disetujui ${siapa}. Aset ikut aktif saat pengeluarannya disetujui.`}
            {hasil.tanpaBukti && (
              <>
                <br />
                Belum ada foto bukti: masuk daftar &quot;belum ada bukti&quot;.
              </>
            )}
            {hasil.patungan && (
              <>
                <br />
                Patungan diminta: {hasil.patungan}. Mereka bisa membayar setelah aset ini disetujui.
              </>
            )}
          </div>
          {hasil.errorPatungan && (
            <div className="notice bad">
              Aset tersimpan, tapi permintaan patungan gagal: {hasil.errorPatungan}. Minta ulang dari kartu aset di{" "}
              <Link href="/riwayat?jenis=aset" className="link-line">
                riwayat/
              </Link>
              .
            </div>
          )}
          <div className="aksi-hasil">
            <button type="button" className="btn-go" onClick={reset}>
              <span>Catat lagi</span>
              <span className="arr">+</span>
            </button>
            <Link href="/riwayat?jenis=aset" className="btn-line">
              riwayat-aset/
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form className="entry-form" onSubmit={simpan} noValidate>
      <section className="fs">
        <div className="fs-head">
          <span className="slug">asal/</span>
        </div>
        <div className="fs-body form-1">
          <div className="seg seg-wide" role="radiogroup" aria-label="Asal aset">
            {ASAL.map((a) => (
              <button
                key={a.v}
                type="button"
                role="radio"
                aria-checked={sumber === a.v}
                className={sumber === a.v ? "active" : undefined}
                onClick={() => setSumber(a.v)}
              >
                {a.label}
              </button>
            ))}
          </div>
          <p className="ref">{ASAL.find((a) => a.v === sumber)!.ket}</p>
        </div>
      </section>

      <section className="fs">
        <div className="fs-head">
          <span className="slug">rincian/</span>
          {tgl && tgl < hariIni && <span className="hint">dicatat mundur: {fmtTanggal(tgl)}</span>}
        </div>
        <div className="fs-body form-1">
          <div className="fld">
            <label htmlFor="nama">Nama barang</label>
            <input id="nama" type="text" value={nama} onChange={(e) => setNama(e.target.value)} placeholder="mis. Blender 2 liter" required />
          </div>
          <div className="fld">
            <label htmlFor="nilai">{setor ? "Nilai usulan" : "Harga beli"}</label>
            <InputUang id="nilai" nilai={nilai} onChange={setNilai} required />
            {setor && <p className="ref">Penyetuju bisa mengubahnya menjadi nilai yang disepakati bertiga.</p>}
          </div>
          <div className="fld">
            <label htmlFor="tgl">{setor ? "Tanggal diserahkan" : "Tanggal beli"}</label>
            <input id="tgl" type="date" value={tgl} max={hariIni || undefined} onChange={(e) => setTgl(e.target.value)} required />
          </div>
          <div className="fld">
            <label htmlFor="umur">Umur pakai</label>
            <div className="inp-unit">
              <input id="umur" type="text" inputMode="numeric" pattern="[0-9]*" value={umur} onChange={(e) => setUmur(e.target.value.replace(/\D/g, ""))} />
              <span className="unit">bulan</span>
            </div>
            <p className="ref">Untuk penyusutan garis lurus. Default {UMUR_DEFAULT} bulan.</p>
          </div>
          <div className="fld">
            <label htmlFor="lokasi">Lokasi (opsional)</label>
            <input id="lokasi" type="text" value={lokasi} onChange={(e) => setLokasi(e.target.value)} placeholder="mis. rumah Rifki / kedai" />
          </div>
        </div>
      </section>

      {sumber === "beli_kas" && (
        <section className="fs">
          <div className="fs-head">
            <span className="slug">pengeluaran-kas/</span>
          </div>
          <div className="fs-body form-1">
            {kategoriAsetId ? (
              <>
                <label className="tile">
                  <input type="checkbox" checked={catatKas} onChange={(e) => setCatatKas(e.target.checked)} />
                  <span className="tile-box" />
                  <span>Catat juga pengeluaran kas &quot;Pembelian aset&quot;</span>
                </label>
                {catatKas ? (
                  <div className="fld">
                    <label>Metode bayar</label>
                    <div className="seg seg-wide" role="radiogroup" aria-label="Metode">
                      {(["tunai", "qris", "transfer"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          role="radio"
                          aria-checked={metode === m}
                          className={metode === m ? "active" : undefined}
                          onClick={() => setMetode(m)}
                        >
                          {m === "qris" ? "QRIS" : m[0].toUpperCase() + m.slice(1)}
                        </button>
                      ))}
                    </div>
                    <p className="ref">Saldo kas berkurang sebesar harga beli. Aset mengikuti status pengeluaran ini.</p>
                  </div>
                ) : (
                  <p className="ref warn">Matikan hanya bila pengeluarannya sudah dicatat terpisah, supaya kas tidak terpotong dua kali.</p>
                )}
              </>
            ) : (
              <div className="notice warn">Kategori &quot;Pembelian aset&quot; tidak ditemukan — catat pengeluarannya lewat Catat → Pengeluaran.</div>
            )}
          </div>
        </section>
      )}

      {sumber === "beli_owner" && ownerLain.length > 0 && (
        <section className="fs">
          <div className="fs-head">
            <span className="slug">patungan/</span>
            <span className="hint">opsional</span>
          </div>
          <div className="fs-body form-1">
            <label className="tile">
              <input type="checkbox" checked={mintaPatungan} onChange={(e) => setMintaPatungan(e.target.checked)} />
              <span className="tile-box" />
              <span>Minta patungan ke owner lain</span>
            </label>
            {mintaPatungan && (
              <>
                <PilihPatungan idAwal="patungan" owner={ownerLain} total={nilai} batas={null} isi={isiPatungan} onChange={setIsiPatungan} />
                <p className="ref">Porsi baru bergeser setelah mereka benar-benar mengganti dan kamu menyetujuinya.</p>
              </>
            )}
          </div>
        </section>
      )}

      <section className="fs">
        <div className="fs-head">
          <span className="slug">foto-barang/</span>
          <span className="hint">{setor ? "bukti barang disetor" : "opsional"}</span>
        </div>
        <div className="fs-body">
          <PilihFoto file={fotoBarang} onChange={setFotoBarang} />
        </div>
      </section>

      <section className="fs">
        <div className="fs-head">
          <span className="slug">foto-nota/</span>
          <span className="hint">{setor ? "jika ada" : "nota / struk / transfer"}</span>
        </div>
        <div className="fs-body">
          <PilihFoto file={fotoNota} onChange={setFotoNota} />
        </div>
      </section>

      {akanMenunggu && (
        <div className="notice warn">
          Catatan ini akan berstatus <b>menunggu</b> dan baru dihitung setelah disetujui {penyetuju.join(" atau ")}
          {sumber === "beli_kas" ? ` (pengeluaran kas di atas ${rupiah(BATAS_SETUJU_KAS)}).` : " (uang/barang pribadi owner)."}
        </div>
      )}

      <div className="form-actions">
        <p className="err form-err" role="alert">
          {error}
        </p>
        <button type="submit" className="btn-go" disabled={!!proses || !online}>
          <span>{proses ?? (online ? "Simpan" : "Tidak ada sinyal")}</span>
          <span className="arr">↗</span>
        </button>
      </div>
    </form>
  );
}
