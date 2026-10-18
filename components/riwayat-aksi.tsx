"use client";

import { useOnline } from "@/components/status-sinyal";
import type { ItemRiwayat } from "@/lib/riwayat";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/**
 * Aksi di kartu riwayat:
 * - catatan aktif  -> ajukan batal (owner lain yang menyetujui; dicek di database)
 * - catatan menunggu milik saya -> tarik (langsung batal; belum dihitung ke mana pun)
 */
export function AksiRiwayat({ item, userId }: { item: ItemRiwayat; userId: string }) {
  const router = useRouter();
  const online = useOnline();
  const [buka, setBuka] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [proses, setProses] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // id stabil: kirim ulang setelah sinyal putus tidak membuat pengajuan ganda
  const idAjuan = useRef<string | null>(null);

  if (item.pengajuan) {
    return (
      <div className="notice warn ajuan-batal">
        Pengajuan batal oleh {item.pengajuan.olehId === userId ? "kamu" : item.pengajuan.oleh}: “{item.pengajuan.alasan}”.{" "}
        {item.pengajuan.olehId === userId ? (
          "Menunggu persetujuan owner lain."
        ) : (
          <Link href="/setujui" className="link-line">
            putuskan di setujui/
          </Link>
        )}
      </div>
    );
  }

  const tarik = item.status === "menunggu" && item.pencatatId === userId;
  const ajukan = item.status === "aktif";
  if (!tarik && !ajukan) return null;

  const kirim = async () => {
    const teks = alasan.trim();
    if (!teks) return setError("Alasan wajib diisi.");
    setProses(true);
    setError(null);
    const supabase = createClient();
    let pesan: string | null = null;
    if (tarik) {
      const { error: err } = await supabase
        .from(item.tabel)
        .update({ status: "batal", alasan_batal: teks })
        .eq("id", item.id)
        .select("id")
        .single();
      if (err)
        pesan = err.code === "PGRST116" ? "Tidak bisa ditarik — mungkin sudah diproses owner lain. Muat ulang halaman." : err.message;
    } else {
      idAjuan.current ??= crypto.randomUUID();
      const { error: err } = await supabase
        .from("pengajuan_batal")
        .insert({ id: idAjuan.current, tabel: item.tabel, baris_id: item.id, alasan: teks });
      // 23505: pengajuan ini sudah tersimpan (kirim ulang) atau sudah ada pengajuan terbuka dari owner lain
      if (err && err.code !== "23505") pesan = err.message;
    }
    setProses(false);
    if (pesan) return setError(pesan);
    setBuka(false);
    router.refresh();
  };

  if (!buka) {
    return (
      <div className="card-actions">
        <button type="button" className="btn-line" onClick={() => setBuka(true)}>
          {tarik ? "tarik-catatan/" : "ajukan-batal/"}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="fld tolak-box">
        <label htmlFor={`alasan-${item.id}`}>{tarik ? "Alasan menarik catatan (wajib)" : "Alasan pembatalan (wajib)"}</label>
        <textarea
          id={`alasan-${item.id}`}
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          placeholder={tarik ? "mis. salah ketik jumlah, akan dicatat ulang" : "mis. nota dobel dengan catatan 12 Okt"}
        />
        <p className="ref">
          {tarik
            ? "Catatan yang masih menunggu belum dihitung ke kas/porsi, jadi langsung batal."
            : "Catatan tetap aktif sampai owner lain menyetujui pembatalan."}
        </p>
      </div>
      <p className="err" role="alert">
        {error}
      </p>
      <div className="card-actions">
        <button
          type="button"
          className="btn-line"
          onClick={() => {
            setBuka(false);
            setError(null);
          }}
          disabled={proses}
        >
          kembali/
        </button>
        <button type="button" className="btn-go btn-danger" onClick={kirim} disabled={proses || !online}>
          <span>{proses ? "Mengirim…" : !online ? "Tidak ada sinyal" : tarik ? "Tarik catatan" : "Ajukan batal"}</span>
          <span className="arr">✕</span>
        </button>
      </div>
    </>
  );
}
