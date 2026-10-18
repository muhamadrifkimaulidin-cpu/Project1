import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";

/**
 * Dipanggil oleh database (pg_net, migrasi 006) — bukan oleh browser.
 * Diamankan dengan header x-3rally-secret = env NOTIF_SECRET (nilai yang sama disimpan di Supabase Vault).
 * Body: { langganan: [{endpoint, p256dh, auth}], judul, isi, url, tag }
 */
type Langganan = { endpoint: string; p256dh: string; auth: string };

const MAKS_LANGGANAN = 30;

function samaRahasia(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const teks = (v: unknown, maks: number) => (typeof v === "string" ? v.slice(0, maks) : "");

export async function POST(request: Request) {
  const rahasia = process.env.NOTIF_SECRET;
  const publik = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privat = process.env.VAPID_PRIVATE_KEY;
  if (!rahasia || !publik || !privat) {
    return Response.json({ error: "Notifikasi belum dikonfigurasi di Vercel" }, { status: 503 });
  }
  if (!samaRahasia(request.headers.get("x-3rally-secret") ?? "", rahasia)) {
    return Response.json({ error: "Tidak sah" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body bukan JSON" }, { status: 400 });
  }
  const langganan = (Array.isArray(body.langganan) ? body.langganan : [])
    .filter(
      (l): l is Langganan =>
        !!l && typeof l.endpoint === "string" && l.endpoint.startsWith("https://") &&
        typeof l.p256dh === "string" && typeof l.auth === "string",
    )
    .slice(0, MAKS_LANGGANAN);
  if (!langganan.length) return Response.json({ terkirim: 0, gagal: [] });

  // Hanya tautan ke halaman 3Rally sendiri
  const url = teks(body.url, 200);
  const payload = JSON.stringify({
    judul: teks(body.judul, 100) || "3Rally",
    isi: teks(body.isi, 300),
    url: url.startsWith("/") && !url.startsWith("//") ? url : "/beranda",
    tag: teks(body.tag, 100) || undefined,
  });

  // subject VAPID: alamat situs ini (https di Vercel), dipakai layanan push untuk menghubungi pengirim.
  // Wajib https:/mailto: — saat uji lokal (http) pakai mailto fiktif.
  const asal = new URL(request.url).origin;
  webpush.setVapidDetails(asal.startsWith("https://") ? asal : "mailto:uji@3rally.invalid", publik, privat);
  const hasil = await Promise.allSettled(
    langganan.map((l) =>
      webpush.sendNotification({ endpoint: l.endpoint, keys: { p256dh: l.p256dh, auth: l.auth } }, payload, {
        TTL: 60 * 60 * 24, // simpan di layanan push maks. 1 hari bila HP mati
        urgency: "high",
      }),
    ),
  );
  const gagal = hasil.flatMap((h, i) =>
    h.status === "rejected"
      ? [{ endpoint: langganan[i].endpoint.slice(0, 60), status: (h.reason as { statusCode?: number })?.statusCode ?? null }]
      : [],
  );
  return Response.json({ terkirim: hasil.length - gagal.length, gagal });
}
