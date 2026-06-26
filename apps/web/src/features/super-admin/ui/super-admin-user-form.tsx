"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { buildApiUrl } from "@/shared/lib/api-url";
import { SuperAdminOutlineLink } from "@/features/super-admin/ui/super-admin-action-links";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";

type SuperAdminUserFormProps = {
  cancelHref?: string;
};

export function SuperAdminUserForm({ cancelHref = "/super-admin/usuarios" }: SuperAdminUserFormProps) {
  const { t } = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(true);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!firstName.trim()) {
        toast.error(t("superAdmin.common.requiredName"));
        return;
      }
      if (!email.trim()) {
        toast.error(t("superAdmin.common.requiredEmail"));
        return;
      }
      if (password.length < 8) {
        toast.error(t("superAdmin.common.passwordMin8"));
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch(buildApiUrl("/api/super-admin/platform-users"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            isActive: active,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          toast.error(data.error ?? t("superAdmin.users.createFailed"));
          return;
        }
        toast.success(t("superAdmin.users.createSuccess"));
        router.push(cancelHref);
        router.refresh();
      } catch {
        toast.error(t("common.apiConnectionError"));
      } finally {
        setSubmitting(false);
      }
    },
    [active, cancelHref, email, firstName, lastName, password, router, t, toast],
  );

  return (
    <>
      <h3 className="text-sm font-semibold text-zinc-900">{t("superAdmin.users.newPlatformTitle")}</h3>
      <p className="mt-1 text-xs text-zinc-500">{t("superAdmin.users.newPlatformHelp")}</p>
      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => void handleSubmit(e)}>
        <label className="sa-label">
          {t("superAdmin.common.firstName")} *
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder={t("superAdmin.users.firstNamePlaceholder")}
            className="sa-input"
            autoComplete="given-name"
            required
          />
        </label>
        <label className="sa-label">
          {t("superAdmin.common.lastName")}
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder={t("superAdmin.users.lastNamePlaceholder")}
            className="sa-input"
            autoComplete="family-name"
          />
        </label>
        <label className="sa-label sm:col-span-2">
          {t("superAdmin.common.email")} *
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@fleethub.local"
            className="sa-input"
            autoComplete="email"
            required
          />
        </label>
        <label className="sa-label sm:col-span-2">
          {t("auth.password")} *
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("superAdmin.common.passwordMinPlaceholder")}
            className="sa-input"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 accent-orange-500"
          />
          {t("superAdmin.common.userActive")}
        </label>

        <div className="mt-1 flex flex-wrap gap-2 sm:col-span-2">
          <button type="submit" disabled={submitting} className="sa-btn-primary px-6">
            {submitting ? t("superAdmin.common.creating") : t("superAdmin.users.createSuperAdmin")}
          </button>
          <SuperAdminOutlineLink href={cancelHref}>{t("common.cancel")}</SuperAdminOutlineLink>
        </div>
      </form>
    </>
  );
}
