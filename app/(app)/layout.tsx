import { BottomNav, NavTabs } from "@/components/navigasi";
import { LogoutButton } from "@/components/logout-button";
import { BannerOffline } from "@/components/status-sinyal";
import { TemaToggle } from "@/components/tema-toggle";
import { Topbar } from "@/components/topbar";
import { hitungMenungguSaya } from "@/lib/data";
import { ambilSesi } from "@/lib/sesi";
import { Suspense } from "react";

async function TopbarPengguna() {
  const { profil, email } = await ambilSesi();
  return <Topbar meta={profil?.nama ?? email} />;
}

async function NavPengguna() {
  const { profil, email } = await ambilSesi();
  return (
    <div className="nav-user">
      <span>{profil?.nama ?? email}</span>
      <small>{profil?.peran ?? "belum terdaftar"}</small>
    </div>
  );
}

/** Badge "Setujui": jumlah item menunggu yang boleh saya setujui */
async function jumlahMenunggu() {
  const { userId, profil } = await ambilSesi();
  if (profil?.peran !== "owner" || !profil.aktif) return 0;
  return hitungMenungguSaya(userId);
}

async function NavTabsPengguna() {
  return <NavTabs menunggu={await jumlahMenunggu()} />;
}

async function BottomNavPengguna() {
  return <BottomNav menunggu={await jumlahMenunggu()} />;
}

/** Hanya owner aktif yang boleh masuk ke halaman aplikasi (karyawan: Tahap 2). */
async function GerbangOwner({ children }: { children: React.ReactNode }) {
  const { profil, email } = await ambilSesi();
  if (!profil) {
    return (
      <div className="notice bad">
        Akun <b>{email}</b> sudah bisa login, tapi belum ada di tabel <code>profil</code>. Minta owner menambahkannya
        di Supabase (lihat langkah setup di deskripsi PR).
      </div>
    );
  }
  if (profil.peran !== "owner" || !profil.aktif) {
    return <div className="notice warn">Akun ini bukan owner aktif. Fitur karyawan menyusul di Tahap 2.</div>;
  }
  return <>{children}</>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={<Topbar />}>
        <TopbarPengguna />
      </Suspense>
      <header className="nav">
        <div className="nav-logo">
          3<span className="tick">’</span>rally
        </div>
        <Suspense fallback={<NavTabs menunggu={0} />}>
          <NavTabsPengguna />
        </Suspense>
        <TemaToggle varian="cell" />
        <Suspense>
          <NavPengguna />
        </Suspense>
        <LogoutButton />
      </header>
      <BannerOffline />
      <main className="app">
        <Suspense fallback={<div className="loading-row"><div className="spin dark" /></div>}>
          <GerbangOwner>{children}</GerbangOwner>
        </Suspense>
      </main>
      <Suspense fallback={<BottomNav menunggu={0} />}>
        <BottomNavPengguna />
      </Suspense>
    </>
  );
}
