import { Mega } from "@/components/judul";
import { Topbar } from "@/components/topbar";

// Kerangka layar login / lupa password / ganti password (pola login WWTP)
export function LayarAuth({ judul, lead, children }: { judul: string; lead: string; children: React.ReactNode }) {
  return (
    <>
      <Topbar />
      <div className="login-hero">
        <Mega teks={judul} />
      </div>
      <div className="login-grid">
        <div className="login-info">
          <p className="mono-row">
            <span>rengasdengklok</span>
            <span>owner only</span>
          </p>
          <p className="lead">{lead}</p>
        </div>
        {children}
      </div>
    </>
  );
}
