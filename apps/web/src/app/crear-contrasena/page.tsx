import { Suspense } from "react";
import { ResetPasswordForm } from "@/features/auth/ui/reset-password-form";

export default function CrearContrasenaPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm variant="setup" />
    </Suspense>
  );
}
