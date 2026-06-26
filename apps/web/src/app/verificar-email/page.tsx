import { Suspense } from "react";
import { VerifyEmailForm } from "@/features/auth/ui/verify-email-form";

export default function VerificarEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}
