import { redirect } from "next/navigation";
import { getSession } from "@/features/auth/server/session.service";
import { AuthLoadingView } from "@/features/auth/ui/auth-loading-view";

function safeNextPath(raw: string | undefined): string {
  if (!raw || typeof raw !== "string") {
    return "/dashboard";
  }
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/dashboard";
  }
  if (trimmed.includes("?") || trimmed.includes("#") || trimmed.includes("://")) {
    return "/dashboard";
  }
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(trimmed)) {
    return "/dashboard";
  }
  if (trimmed === "/login" || trimmed.startsWith("/auth/")) {
    return "/dashboard";
  }
  if (trimmed.startsWith("/super-admin")) {
    return trimmed;
  }
  return trimmed;
}

type PageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function AuthLoadingPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const sp = await searchParams;
  const next = safeNextPath(sp.next);

  return <AuthLoadingView next={next} />;
}
