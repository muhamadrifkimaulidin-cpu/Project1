import { LayarAuth } from "@/components/layar-auth";
import { UpdatePasswordForm } from "@/components/update-password-form";

export default function Page() {
  return (
    <LayarAuth judul="PASSWORD" lead="Buat password baru untuk akun Anda.">
      <UpdatePasswordForm />
    </LayarAuth>
  );
}
