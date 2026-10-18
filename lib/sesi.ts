import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type Profil = { id: string; nama: string; peran: "owner" | "karyawan"; aktif: boolean };

/** Pengguna login + baris profil-nya. Redirect ke login jika sesi habis. */
export async function ambilSesi(): Promise<{ userId: string; email: string; profil: Profil | null }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/auth/login");

  const { data: profil } = await supabase
    .from("profil")
    .select("id, nama, peran, aktif")
    .eq("id", claims.sub)
    .maybeSingle<Profil>();

  return { userId: claims.sub, email: String(claims.email ?? ""), profil };
}
