"use client";

import { createClient } from "@/lib/supabase/client";
import { TemaToggle } from "@/components/tema-toggle";
import { useOnline } from "@/components/status-sinyal";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const online = useOnline();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!online) return setError("Tidak ada sinyal. Coba lagi setelah tersambung.");
    const supabase = createClient();
    setIsLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message === "Invalid login credentials" ? "Email atau password salah." : error.message);
      setIsLoading(false);
      return;
    }
    router.replace("/beranda");
    router.refresh();
  };

  return (
    <form className="login-panel" onSubmit={handleLogin}>
      <label className="slug" htmlFor="email">email/</label>
      <input
        id="email"
        type="email"
        autoComplete="username"
        inputMode="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <label className="slug" htmlFor="password">password/</label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button type="submit" className="btn-go" disabled={isLoading}>
        <span>{isLoading ? "Masuk…" : "Masuk"}</span>
        <span className="arr">↗</span>
      </button>
      <p className="err" role="alert">{error}</p>
      <Link href="/auth/forgot-password" className="link-line">lupa-password/</Link>
      <TemaToggle varian="line" />
    </form>
  );
}
