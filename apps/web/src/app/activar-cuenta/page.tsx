import { Suspense } from "react";
import { ActivateAccountForm } from "@/features/auth/ui/activate-account-form";

export default function ActivarCuentaPage() {
  return (
    <Suspense fallback={null}>
      <ActivateAccountForm />
    </Suspense>
  );
}
