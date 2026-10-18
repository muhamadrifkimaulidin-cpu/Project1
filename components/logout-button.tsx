"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    await createClient().auth.signOut();
    router.replace("/auth/login");
    router.refresh();
  };

  return (
    <button type="button" className="nav-cta" onClick={logout}>
      <span>Keluar</span>
      <span className="arr">↗</span>
    </button>
  );
}
