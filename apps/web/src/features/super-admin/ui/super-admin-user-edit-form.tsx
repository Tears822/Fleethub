"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { SuperAdminUserEditSnapshot } from "@/features/super-admin/server/users.queries";
import {
  labelToRole,
  type UserRoleLabel,
} from "@/features/settings/lib/tenant-user-roles";
import { buildApiUrl } from "@/shared/lib/api-url";
import { SuperAdminOutlineLink } from "@/features/super-admin/ui/super-admin-action-links";
import { SuperAdminResetUser2faButton } from "@/features/super-admin/ui/super-admin-reset-user-2fa-button";
import { SuperAdminResetPasswordButton } from "@/features/super-admin/ui/super-admin-reset-password-button";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";

const TENANT_ROLES: UserRoleLabel[] = ["Admin", "Gestor", "Solo lectura"];

type SuperAdminUserEditFormProps = {
  initial: SuperAdminUserEditSnapshot;
  cancelHref?: string;
};

export function SuperAdminUserEditForm({
  initial,
  cancelHref = "/super-admin/usuarios",
}: SuperAdminUserEditFormProps) {
  const { t } = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [email, setEmail] = useState(initial.email);
  const [active, setActive] = useState(initial.isActive);
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRoleLabel>(
    initial.kind === "tenant" ? initial.role : "Admin",
  );
  const [companyIds, setCompanyIds] = useState<string[]>(
    initial.kind === "tenant" ? initial.companyIds : [],
  );

  const toggleCompany = (id: string) => {
    setCompanyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

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
      if (initial.kind === "tenant" && companyIds.length === 0) {
        toast.error(t("superAdmin.users.selectCompany"));
        return;
      }

      setSubmitting(true);
      try {
        const emailNorm = email.trim().toLowerCase();
        if (initial.kind === "platform") {
          const res = await fetch(buildApiUrl(`/api/super-admin/platform-users/${initial.id}`), {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: emailNorm,
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              isActive: active,
              ...(password ? { password } : {}),
            }),
          });
          const data = (await res.json()) as { error?: string };
          if (!res.ok) {
            toast.error(data.error ?? t("superAdmin.users.updateFailed"));
            return;
          }
        } else {
          const res = await fetch(buildApiUrl(`/api/super-admin/tenant-users/${initial.id}`), {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tenantId: initial.tenantId,
              email: emailNorm,
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              role: labelToRole(role),
              isActive: active,
              companyIds,
              ...(password ? { password } : {}),
            }),
          });
          const data = (await res.json()) as { error?: string };
          if (!res.ok) {
            toast.error(data.error ?? t("superAdmin.users.updateFailed"));
            return;
          }
        }

        toast.success(t("superAdmin.users.updateSuccess"));
        router.push(cancelHref);
        router.refresh();
      } catch {
        toast.error(t("common.apiConnectionError"));
      } finally {
        setSubmitting(false);
      }
    },
    [active, cancelHref, companyIds, email, firstName, initial, lastName, password, role, router, t, toast],
  );

  const kind = initial.kind;
  const tenantId = initial.kind === "tenant" ? initial.tenantId : undefined;

  return (
    <>
      <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {t("superAdmin.users.totpSection")}
        </p>
        <p className="mt-1 text-sm text-zinc-700">
          {t("superAdmin.users.totpStatus")}{" "}
          <span className={initial.totpEnabled ? "font-semibold text-emerald-700" : "text-zinc-600"}>
            {initial.totpEnabled ? t("superAdmin.common.active") : t("superAdmin.common.notConfigured")}
          </span>
        </p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-600">
          {t("superAdmin.users.totpRecoveryHelp")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <SuperAdminResetUser2faButton
            userId={initial.id}
            userName={[initial.firstName, initial.lastName].filter(Boolean).join(" ") || initial.email}
            kind={kind}
            tenantId={tenantId}
            totpEnabled={initial.totpEnabled}
            onSuccess={() => router.refresh()}
          />
          <SuperAdminResetPasswordButton
            userId={initial.id}
            userName={[initial.firstName, initial.lastName].filter(Boolean).join(" ") || initial.email}
            email={initial.email}
            kind={kind}
            tenantId={tenantId}
          />
        </div>
      </div>

      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => void handleSubmit(e)}>
      {initial.kind === "tenant" ? (
        <p className="text-xs text-zinc-500 sm:col-span-2">
          {t("superAdmin.users.tenantLabel")}{" "}
          <span className="font-semibold text-zinc-800">{initial.tenantName}</span>
        </p>
      ) : (
        <p className="text-xs text-zinc-500 sm:col-span-2">{t("superAdmin.users.platformUserLabel")}</p>
      )}

      <label className="sa-label">
        {t("superAdmin.common.firstName")} *
        <input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="sa-input"
          required
        />
      </label>
      <label className="sa-label">
        {t("superAdmin.common.lastName")}
        <input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="sa-input"
        />
      </label>
      <label className="sa-label sm:col-span-2">
        {t("superAdmin.common.email")} *
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="sa-input"
          required
        />
      </label>

      {initial.kind === "tenant" ? (
        <>
          <label className="sa-label">
            {t("superAdmin.common.role")}
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRoleLabel)}
              className="sa-input"
            >
              {TENANT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="sa-label">
            {t("superAdmin.common.newPassword")}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("superAdmin.common.passwordLeaveEmpty")}
              className="sa-input"
              minLength={8}
              autoComplete="new-password"
            />
          </label>
        </>
      ) : (
        <label className="sa-label sm:col-span-2">
          {t("superAdmin.common.newPassword")}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("superAdmin.common.passwordLeaveEmpty")}
            className="sa-input"
            minLength={8}
            autoComplete="new-password"
          />
        </label>
      )}

      <label className="flex items-center gap-2 self-center text-sm text-zinc-700">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-300 accent-orange-500"
        />
        {t("superAdmin.common.userActive")}
      </label>

      {initial.kind === "tenant" ? (
        <div className="sm:col-span-2">
          <p className="text-xs font-medium text-zinc-600">{t("superAdmin.users.assignedCompanies")}</p>
          <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-2">
            {initial.companies.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-50">
                  <input
                    type="checkbox"
                    checked={companyIds.includes(c.id)}
                    onChange={() => toggleCompany(c.id)}
                    className="h-4 w-4 rounded border-zinc-300 text-orange-500"
                  />
                  <span>{c.legalName}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-1 flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" disabled={submitting} className="sa-btn-primary px-6">
          {submitting ? t("common.saving") : t("superAdmin.common.saveChanges")}
        </button>
        <SuperAdminOutlineLink href={cancelHref}>{t("common.cancel")}</SuperAdminOutlineLink>
      </div>
    </form>
    </>
  );
}
