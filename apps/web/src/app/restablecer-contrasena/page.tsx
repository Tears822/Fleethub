import { Suspense } from "react";
import { ResetPasswordForm } from "@/features/auth/ui/reset-password-form";

export default function RestablecerContrasenaPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
