import { redirect } from "next/navigation";
import { getSession } from "@/features/auth/server/session.service";
import { LandingPage } from "@/features/landing/ui/landing-page";

export default async function Home() {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }
  return <LandingPage />;
}
