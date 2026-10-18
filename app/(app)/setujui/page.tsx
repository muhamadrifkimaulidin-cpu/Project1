import { Mega } from "@/components/judul";
import { KartuMenungguLain, KartuSetujui } from "@/components/kartu-setujui";
import { ambilAntrean } from "@/lib/antrean";
import { ambilOwnerLain } from "@/lib/data";
import { ambilSesi } from "@/lib/sesi";
import { Suspense } from "react";

async function Antrean() {
  const { userId, profil } = await ambilSesi();
  const [{ bolehSaya, milikSaya }, ownerLain] = await Promise.all([ambilAntrean(userId), ambilOwnerLain(userId)]);
  const semuaOwner = [profil?.nama ?? "", ...ownerLain];
  // Penyetuju sah = owner selain pencatat dan selain pemilik uang
  const penyetuju = (pencatat: string, pemilik: string | null) =>
    semuaOwner.filter((x) => x && x !== pencatat && x !== pemilik).join(" atau ") || "owner lain";

  return (
    <>
      <section className="fs">
        <div className="fs-head">
          <span className="slug">perlu-persetujuan-saya/</span>
          <span className="hint">{bolehSaya.length} catatan · terlama di atas</span>
        </div>
      </section>
      {bolehSaya.length === 0 ? (
        <div className="empty">tidak ada yang perlu kamu setujui ✓</div>
      ) : (
        <div className="cards">
          {bolehSaya.map((i) => (
            <KartuSetujui key={`${i.tabel}-${i.id}`} item={i} />
          ))}
        </div>
      )}

      <section className="fs">
        <div className="fs-head">
          <span className="slug">catatan-saya-menunggu/</span>
          <span className="hint">disetujui owner lain</span>
        </div>
      </section>
      {milikSaya.length === 0 ? (
        <div className="empty">tidak ada catatanmu yang menunggu</div>
      ) : (
        <div className="cards">
          {milikSaya.map((i) => (
            <KartuMenungguLain key={`${i.tabel}-${i.id}`} item={i} penyetuju={penyetuju(i.pencatat, i.pemilikUang)} />
          ))}
        </div>
      )}
    </>
  );
}

export default function Page() {
  return (
    <>
      <div className="hero">
        <Mega teks="SETUJUI" />
      </div>
      <div className="hero-info">
        <div className="hi-left mono-row">
          <span>persetujuan-silang/</span>
          <span>bukan catatan · bukan uang saya</span>
        </div>
        <div className="hi-right">
          <p>Periksa foto bukti sebelum menyetujui. Yang disetujui langsung dihitung ke kas dan porsi.</p>
        </div>
      </div>
      <Suspense
        fallback={
          <div className="loading-row">
            <div className="spin dark" />
          </div>
        }
      >
        <Antrean />
      </Suspense>
    </>
  );
}
