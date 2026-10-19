/**
 * Deploy Preview Vercel memakai database UJI (variabel Supabase environment Preview); Production memakai
 * database asli. Dipakai untuk pita MODE UJI, nama & ikon aplikasi di layar utama HP.
 */
export const MODE_UJI = process.env.VERCEL_ENV === "preview";
export const NAMA_APLIKASI = MODE_UJI ? "3Rally UJI" : "3Rally";
