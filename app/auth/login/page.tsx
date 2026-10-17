import { LayarAuth } from "@/components/layar-auth";
import { LoginForm } from "@/components/login-form";

export default function Page() {
  return (
    <LayarAuth
      judul="KEDAI JUS"
      lead="Setiap rupiah yang dikeluarkan owner tercatat sebagai modal — dengan bukti dan persetujuan silang."
    >
      <LoginForm />
    </LayarAuth>
  );
}
