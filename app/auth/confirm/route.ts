import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

/**
 * Tujuan link email Supabase (reset password, dsb.). Dua bentuk link:
 * - token_hash + type: dari template email yang diarahkan ke /auth/confirm. Bisa dibuka di browser/HP mana saja.
 * - code (PKCE, template bawaan): hanya berhasil di browser yang sama dengan yang meminta link.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  // hanya path di aplikasi ini (cegah open redirect lewat ?next=https://...)
  const nextParam = searchParams.get("next") ?? "/beranda";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/beranda";

  const supabase = await createClient();
  let pesan = "Tautan tidak lengkap";
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) redirect(next);
    pesan = error.message;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
    pesan = "Tautan harus dibuka di browser yang sama dengan saat meminta reset, atau sudah kedaluwarsa. Minta tautan baru.";
  }
  redirect(`/auth/error?error=${encodeURIComponent(pesan)}`);
}
