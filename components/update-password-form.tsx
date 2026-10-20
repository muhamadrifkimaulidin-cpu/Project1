"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UpdatePasswordForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const simpan = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      // tanpa sesi = link reset tidak terbuka dengan benar (kedaluwarsa / browser lain / dibuka langsung)
      setError(
        /session/i.test(error.message)
          ? "Sesi reset tidak ditemukan. Minta tautan baru, lalu buka tautan di email itu di browser yang sama."
          : error.message,
      );
      setIsLoading(false);
      return;
    }
    router.replace("/beranda");
  };

  return (
    <form className="login-panel" onSubmit={simpan}>
      <label className="slug" htmlFor="password">password-baru/</label>
      <input
        id="password"
        type="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button type="submit" className="btn-go" disabled={isLoading}>
        <span>{isLoading ? "Menyimpan…" : "Simpan password"}</span>
        <span className="arr">↗</span>
      </button>
      <p className="err" role="alert">{error}</p>
      {error && (
        <Link href="/auth/forgot-password" className="link-line">
          minta-tautan-baru/
        </Link>
      )}
    </form>
  );
}
