import { LayarAuth } from "@/components/layar-auth";
import Link from "next/link";
import { Suspense } from "react";

async function Pesan({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <div className="notice bad">{error ? `Kode error: ${error}` : "Terjadi kesalahan yang tidak diketahui."}</div>;
}

export default function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <LayarAuth judul="GAGAL" lead="Tautan tidak valid atau sudah kedaluwarsa.">
      <div className="login-panel">
        <Suspense>
          <Pesan searchParams={searchParams} />
        </Suspense>
        <Link href="/auth/login" className="link-line">kembali-ke-login/</Link>
      </div>
    </LayarAuth>
  );
}
