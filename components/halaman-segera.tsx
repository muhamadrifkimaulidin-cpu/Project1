import { Mega } from "@/components/judul";

// Placeholder untuk halaman yang dibangun di PR fitur berikutnya
export function HalamanSegera({ judul, lead, isi }: { judul: string; lead: string; isi: string[] }) {
  return (
    <>
      <div className="hero">
        <Mega teks={judul} />
      </div>
      <div className="hero-info">
        <div className="hi-left mono-row">
          <span>tahap-1/</span>
          <span>segera</span>
        </div>
        <div className="hi-right">
          <p>{lead}</p>
        </div>
      </div>
      <div className="notice warn">
        Halaman ini belum dibangun. Akan berisi:
        <ul>
          {isi.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
