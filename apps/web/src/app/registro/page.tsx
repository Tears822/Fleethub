import { Suspense } from "react";
import { SignupForm } from "@/features/auth/ui/signup-form";

export default function RegistroPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
