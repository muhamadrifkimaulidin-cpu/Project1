"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

function jam(d: Date) {
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(" : ");
}

/** Bar hitam paling atas ala WWTP: path · jam · meta (nama pengguna) */
export function Topbar({ meta }: { meta?: string }) {
  const path = usePathname();
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNow(jam(new Date()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="topbar">
      <span className="tb-path">3rally{path}</span>
      <span className="tb-clock">{now ?? "-- : -- : --"}</span>
      {meta && <span className="tb-meta">{meta}</span>}
    </div>
  );
}

/** Kerangka topbar tanpa path & jam (fallback Suspense). */
export function TopbarKerangka() {
  return (
    <div className="topbar">
      <span className="tb-path">3rally/</span>
      <span className="tb-clock">-- : -- : --</span>
    </div>
  );
}
