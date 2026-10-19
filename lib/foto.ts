import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Kompresi foto di klien sebelum upload (CLAUDE.md §6.9):
 * sisi terpanjang 1600 px, WebP quality 0.7, fallback JPEG bila browser tidak bisa encode WebP.
 */
const SISI_MAKS = 1600;
const KUALITAS = 0.7;

export type FotoTerkompres = { blob: Blob; ext: "webp" | "jpg"; contentType: "image/webp" | "image/jpeg" };

function keBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, KUALITAS));
}

async function muatGambar(file: File): Promise<{ img: CanvasImageSource; w: number; h: number; tutup: () => void }> {
  if ("createImageBitmap" in window) {
    try {
      // imageOrientation: foto HP tetap tegak sesuai EXIF
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { img: bmp, w: bmp.width, h: bmp.height, tutup: () => bmp.close() };
    } catch {
      // lanjut ke <img> (Safari lama)
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { img, w: img.naturalWidth, h: img.naturalHeight, tutup: () => URL.revokeObjectURL(url) };
}

export async function kompresFoto(file: File): Promise<FotoTerkompres> {
  const { img, w, h, tutup } = await muatGambar(file);
  try {
    const skala = Math.min(1, SISI_MAKS / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * skala);
    canvas.height = Math.round(h * skala);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Browser tidak mendukung canvas");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const webp = await keBlob(canvas, "image/webp");
    // Safari lama mengembalikan PNG saat diminta WebP: anggap tidak didukung
    if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp", contentType: "image/webp" };
    const jpg = await keBlob(canvas, "image/jpeg");
    if (!jpg) throw new Error("Gagal mengompres foto");
    return { blob: jpg, ext: "jpg", contentType: "image/jpeg" };
  } finally {
    tutup();
  }
}

/**
 * Kompres lalu unggah foto bukti ke bucket private `bukti`: {tabel}/{yyyy-mm}/{id}.{webp|jpg}.
 * id = id catatan, jadi file mudah ditelusuri saat audit. "already exists" dianggap sukses
 * (foto sudah terunggah di percobaan sebelumnya dengan id yang sama).
 */
export async function unggahBukti(
  supabase: SupabaseClient,
  tabel: "transaksi" | "aset" | "kontribusi" | "rnd" | "ganti",
  tanggal: string,
  id: string,
  file: File,
  onTahap?: (t: string) => void,
): Promise<string> {
  onTahap?.("Mengompres foto…");
  const f = await kompresFoto(file);
  const path = `${tabel}/${tanggal.slice(0, 7)}/${id}.${f.ext}`;
  onTahap?.("Mengunggah foto…");
  const { error } = await supabase.storage.from("bukti").upload(path, f.blob, { contentType: f.contentType, upsert: false });
  if (error && !/exists/i.test(error.message)) throw new Error(`Upload foto gagal: ${error.message}`);
  return path;
}
