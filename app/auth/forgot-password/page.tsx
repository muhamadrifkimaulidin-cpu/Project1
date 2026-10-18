import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { LayarAuth } from "@/components/layar-auth";

export default function Page() {
  return (
    <LayarAuth judul="RESET" lead="Masukkan email akun Anda. Tautan untuk membuat password baru akan dikirim ke email itu.">
      <ForgotPasswordForm />
    </LayarAuth>
  );
}
