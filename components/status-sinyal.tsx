"use client";

import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** true saat ada sinyal. Form pencatatan wajib menonaktifkan tombol simpan saat false. */
export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

// Tidak ada mode offline: catatan tidak diantrekan diam-diam (cegah catatan ganda)
export function BannerOffline() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="offline" role="status">
      <WifiOff className="ic" />
      <span>Tidak ada sinyal. Pencatatan & persetujuan dinonaktifkan sampai tersambung lagi — tidak ada yang disimpan.</span>
    </div>
  );
}
