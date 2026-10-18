// Judul besar ala WWTP: "BERANDA’" dengan tanda ’ hijau
export function Mega({ teks, ekor }: { teks: string; ekor?: React.ReactNode }) {
  return (
    <h1 className="mega">
      {teks}
      <span className="tick">’</span>
      {ekor}
    </h1>
  );
}
