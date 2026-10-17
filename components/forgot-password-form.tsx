"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useState } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const kirim = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    // URL ini harus terdaftar di Supabase: Authentication → URL Configuration → Redirect URLs
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    });
    if (error) setError(error.message);
    else setSuccess(true);
    setIsLoading(false);
  };

  if (success) {
    return (
      <div className="login-panel">
        <div className="notice">Jika email terdaftar, tautan ganti password sudah dikirim. Cek inbox/spam.</div>
        <Link href="/auth/login" className="link-line">kembali-ke-login/</Link>
      </div>
    );
  }

  return (
    <form className="login-panel" onSubmit={kirim}>
      <label className="slug" htmlFor="email">email/</label>
      <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit" className="btn-go" disabled={isLoading}>
        <span>{isLoading ? "Mengirim…" : "Kirim tautan"}</span>
        <span className="arr">↗</span>
      </button>
      <p className="err" role="alert">{error}</p>
      <Link href="/auth/login" className="link-line">kembali-ke-login/</Link>
    </form>
  );
}
