"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

// Sebelum hydrate tema belum diketahui; render netral dulu supaya tidak mismatch
const useMounted = () => useSyncExternalStore(() => () => {}, () => true, () => false);

export function TemaToggle({ varian }: { varian: "cell" | "line" }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const gelap = mounted && resolvedTheme === "dark";
  const Ikon = gelap ? Sun : Moon;
  const ganti = () => setTheme(gelap ? "light" : "dark");

  if (varian === "cell") {
    return (
      <button type="button" className="nav-cell" onClick={ganti} title="Ganti tema" aria-label="Ganti tema">
        <Ikon className="ic" />
      </button>
    );
  }
  return (
    <button type="button" className="btn-line btn-theme" onClick={ganti}>
      <Ikon className="ic" /> tema/{mounted ? (gelap ? "dark" : "light") : ""}
    </button>
  );
}
