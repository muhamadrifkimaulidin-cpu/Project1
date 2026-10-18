"use client";

import { createClient } from "@/lib/supabase/client";
import { Bell, BellOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Keadaan =
  | "memuat"
  | "tidak-didukung"
  | "perlu-instal-ios"
  | "belum-dikonfigurasi"
  | "ditolak"
  | "mati"
  | "aktif";

const KUNCI_PUBLIK = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** Kunci VAPID (base64url) -> bytes untuk pushManager.subscribe */
function keBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (b64url + "=".repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const iOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const terpasang = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

async function simpanLangganan(sub: PushSubscription) {
  const j = sub.toJSON();
  const { error } = await createClient().rpc("daftar_push", {
    p_endpoint: j.endpoint,
    p_p256dh: j.keys?.p256dh,
    p_auth: j.keys?.auth,
    p_perangkat: navigator.userAgent.slice(0, 200),
  });
  if (error) throw new Error(error.message);
}

/** Aktifkan/matikan notifikasi push di HP ini + tombol kirim tes. */
export function TombolNotifikasi() {
  const [keadaan, setKeadaan] = useState<Keadaan>("memuat");
  const [proses, setProses] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  const periksa = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return setKeadaan(iOS() && !terpasang() ? "perlu-instal-ios" : "tidak-didukung");
    }
    if (!KUNCI_PUBLIK) return setKeadaan("belum-dikonfigurasi");
    if (Notification.permission === "denied") return setKeadaan("ditolak");
    const reg = await navigator.serviceWorker.register("/sw.js");
    const sub = await reg.pushManager.getSubscription();
    if (sub && Notification.permission === "granted") {
      // Daftarkan ulang setiap buka: memastikan HP ini tercatat atas nama owner yang sedang login
      await simpanLangganan(sub).catch(() => {});
      setKeadaan("aktif");
    } else {
      setKeadaan("mati");
    }
  }, []);

  useEffect(() => {
    periksa().catch(() => setKeadaan("tidak-didukung"));
  }, [periksa]);

  const aktifkan = async () => {
    setProses(true);
    setPesan(null);
    try {
      const izin = await Notification.requestPermission();
      if (izin !== "granted") return setKeadaan(izin === "denied" ? "ditolak" : "mati");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keBytes(KUNCI_PUBLIK) }));
      await simpanLangganan(sub);
      setKeadaan("aktif");
      setPesan("Notifikasi aktif di HP ini. Tekan kirim-tes/ untuk mencoba.");
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Gagal mengaktifkan notifikasi.");
    } finally {
      setProses(false);
    }
  };

  const matikan = async () => {
    setProses(true);
    setPesan(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await createClient().rpc("hapus_push", { p_endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setKeadaan("mati");
    } catch (e) {
      setPesan(e instanceof Error ? e.message : "Gagal mematikan notifikasi.");
    } finally {
      setProses(false);
    }
  };

  const tes = async () => {
    setProses(true);
    setPesan(null);
    const { data, error } = await createClient().rpc("tes_notifikasi");
    setProses(false);
    if (error) return setPesan(error.message);
    setPesan(
      data === "terkirim"
        ? "Tes dikirim — notifikasi muncul dalam beberapa detik. Kalau tidak muncul, cek pengaturan notifikasi HP."
        : data === "belum-dikonfigurasi"
          ? "Server notifikasi belum disiapkan di Supabase (Vault). Hubungi Rifki."
          : "HP ini belum terdaftar — tekan aktifkan dulu.",
    );
  };

  if (keadaan === "memuat") return null;

  const keterangan: Record<Exclude<Keadaan, "memuat">, string> = {
    "tidak-didukung": "Browser ini tidak mendukung notifikasi. Pakai Chrome (Android) atau Safari (iPhone).",
    "perlu-instal-ios": "Di iPhone, notifikasi hanya jalan setelah 3Rally dipasang: Safari → Share → Add to Home Screen, lalu buka dari ikon itu (iOS 16.4+).",
    "belum-dikonfigurasi": "Notifikasi belum disiapkan di server (kunci VAPID belum diisi di Vercel).",
    ditolak: "Izin notifikasi diblokir. Buka pengaturan situs/aplikasi di HP → Notifikasi → Izinkan, lalu muat ulang.",
    mati: "Dapat kabar di HP saat ada catatan yang perlu kamu setujui, dan saat catatanmu disetujui/ditolak.",
    aktif: "Notifikasi aktif di HP ini.",
  };

  return (
    <section className="fs notif">
      <div className="fs-head">
        <span className="slug">notifikasi/</span>
        <span className={`tag${keadaan === "aktif" ? " on" : keadaan === "ditolak" ? " bad" : ""}`}>
          {keadaan === "aktif" ? "aktif" : keadaan === "mati" ? "mati" : "—"}
        </span>
      </div>
      <div className="fs-body">
        <p className="notif-ket">{keterangan[keadaan]}</p>
        {(keadaan === "mati" || keadaan === "aktif") && (
          <div className="notif-aksi">
            {keadaan === "mati" ? (
              <button type="button" className="btn-go" onClick={aktifkan} disabled={proses}>
                <span>{proses ? "Memproses…" : "Aktifkan notifikasi"}</span>
                <Bell className="ic" />
              </button>
            ) : (
              <>
                <button type="button" className="btn-line" onClick={tes} disabled={proses}>
                  kirim-tes/
                </button>
                <button type="button" className="btn-line" onClick={matikan} disabled={proses}>
                  <BellOff className="ic" /> matikan/
                </button>
              </>
            )}
          </div>
        )}
        {pesan && <p className="ref notif-pesan">{pesan}</p>}
      </div>
    </section>
  );
}
