"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildApiUrl, resolveApiFetchUrl } from "@/shared/lib/api-url";
import {
  EMPTY_TENANT_FORM,
  type SuperAdminTenantFormValues,
  type TenantPlan,
} from "@/features/super-admin/lib/super-admin-tenant-form-data";
import { SuperAdminOutlineLink } from "@/features/super-admin/ui/super-admin-action-links";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";

const PLANS: TenantPlan[] = ["Starter", "Pro", "Enterprise"];

function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

type SuperAdminTenantFormProps = {
  mode: "create" | "edit";
  initial: SuperAdminTenantFormValues | Omit<SuperAdminTenantFormValues, "id" | "slug">;
  cancelHref?: string;
};

export function SuperAdminTenantForm({
  mode,
  initial,
  cancelHref = "/super-admin/tenants",
}: SuperAdminTenantFormProps) {
  const { t } = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [slug, setSlug] = useState("id" in initial ? initial.slug : "");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminFirstName, setAdminFirstName] = useState("");
  const [adminLastName, setAdminLastName] = useState("");
  const base =
    "id" in initial
      ? initial
      : { id: "", slug: "", ...EMPTY_TENANT_FORM, ...initial };

  const [form, setForm] = useState<SuperAdminTenantFormValues>(base);

  useEffect(() => {
    if (mode === "edit" && "id" in initial && initial.id) {
      setForm(initial as SuperAdminTenantFormValues);
    }
  }, [initial, mode]);

  useEffect(() => {
    if (mode === "create" && !slug && form.name.trim()) {
      setSlug(slugifyName(form.name));
    }
  }, [form.name, mode, slug]);

  const set = useCallback(
    <K extends keyof SuperAdminTenantFormValues>(key: K, value: SuperAdminTenantFormValues[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.name.trim()) {
        toast.error(t("superAdmin.tenants.requiredOperatorName"));
        return;
      }
      if (mode === "edit") {
        if (!("id" in initial) || !initial.id) {
          toast.error(t("superAdmin.tenants.invalidTenant"));
          return;
        }
        setSubmitting(true);
        try {
          const res = await fetch(
            resolveApiFetchUrl(`/api/super-admin/tenants/${initial.id}`),
            {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: form.name.trim(),
                commercialStatus: form.commercialStatus,
                trialEndsAt: form.trialEndsAt.trim() || null,
                billingPlan: form.plan,
                manager: form.manager,
              }),
            },
          );
          const data = (await res.json()) as { error?: string };
          if (!res.ok) {
            toast.error(data.error ?? t("superAdmin.tenants.saveFailed"));
            return;
          }
          toast.success(t("superAdmin.tenants.updateSuccess"));
          router.refresh();
        } catch {
          toast.error(t("common.apiConnectionError"));
        } finally {
          setSubmitting(false);
        }
        return;
      }
      const finalSlug = slug.trim() || slugifyName(form.name);
      if (!finalSlug) {
        toast.error(t("superAdmin.tenants.invalidSlug"));
        return;
      }
      if (!adminEmail.trim()) {
        toast.error(t("superAdmin.tenants.adminEmailRequiredToast"));
        return;
      }
      if (adminPassword.length < 8) {
        toast.error(t("superAdmin.tenants.adminPasswordMin8"));
        return;
      }
      setSubmitting(true);
      try {
        const res = await fetch(resolveApiFetchUrl("/api/super-admin/tenants"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            slug: finalSlug,
            billingPlan: form.plan,
            commercialStatus: form.commercialStatus,
            trialEndsAt: form.trialEndsAt.trim() || null,
            manager: form.manager.trim() || undefined,
            adminEmail: adminEmail.trim().toLowerCase(),
            adminPassword,
            adminFirstName: adminFirstName.trim() || undefined,
            adminLastName: adminLastName.trim() || undefined,
          }),
        });
        const data = (await res.json()) as { error?: string; slug?: string; tenantId?: string };
        if (!res.ok) {
          toast.error(data.error ?? t("superAdmin.tenants.createFailed"));
          return;
        }
        const tenantId = data.tenantId;
        toast.success(
          tenantId
            ? t("superAdmin.tenants.createSuccessWithCompanies")
            : t("superAdmin.tenants.createSuccess", { slug: data.slug ?? finalSlug }),
        );
        router.push(
          tenantId ? `/super-admin/tenants/${tenantId}` : "/super-admin/tenants",
        );
        router.refresh();
      } catch {
        toast.error(t("common.apiConnectionError"));
      } finally {
        setSubmitting(false);
      }
    },
    [adminEmail, adminFirstName, adminLastName, adminPassword, form, initial, mode, router, slug, t, toast],
  );

  const title =
    mode === "create"
      ? t("superAdmin.tenants.operatorDataTitle")
      : t("superAdmin.tenants.editOperatorTitle", { name: form.name || "tenant" });

  const submitLabel =
    mode === "create" ? t("superAdmin.tenants.createOperator") : t("superAdmin.tenants.saveOperator");

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>

      {mode === "create" ? (
        <p className="text-xs text-zinc-600">{t("superAdmin.tenants.createHelp")}</p>
      ) : (
        <p className="text-xs text-zinc-600">{t("superAdmin.tenants.editHelp")}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sa-label sm:col-span-2">
          {t("superAdmin.tenants.operatorNameLabel")}
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={t("superAdmin.tenants.operatorNamePlaceholder")}
            className="sa-input"
          />
        </label>

        {mode === "create" ? (
          <label className="sa-label sm:col-span-2">
            {t("superAdmin.tenants.slugLabel")}
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="grupo-quino"
              className="sa-input font-mono text-sm"
            />
          </label>
        ) : null}

        <label className="sa-label sm:col-span-2">
          {t("superAdmin.tenants.managerLabel")}
          <input
            type="text"
            value={form.manager}
            onChange={(e) => set("manager", e.target.value)}
            placeholder={t("superAdmin.tenants.managerPlaceholder")}
            className="sa-input"
          />
        </label>

        <label className="sa-label">
          {t("superAdmin.common.plan")}
          <select
            value={form.plan}
            onChange={(e) => set("plan", e.target.value as TenantPlan)}
            className="sa-input"
          >
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="sa-label">
          {t("superAdmin.tenants.commercialStatusLabel")}
          <select
            value={form.commercialStatus}
            onChange={(e) =>
              set("commercialStatus", e.target.value as SuperAdminTenantFormValues["commercialStatus"])
            }
            className="sa-input"
          >
            <option value="TRIAL">{t("superAdmin.common.commercialStatusTrial")}</option>
            <option value="ACTIVE">{t("superAdmin.common.commercialStatusActive")}</option>
            <option value="SUSPENDED">{t("superAdmin.common.commercialStatusSuspended")}</option>
          </select>
        </label>

        <label className="sa-label">
          {t("superAdmin.tenants.trialEndsLabel")}
          <input
            type="date"
            value={form.trialEndsAt}
            onChange={(e) => set("trialEndsAt", e.target.value)}
            className="sa-input"
            disabled={form.commercialStatus !== "TRIAL"}
          />
        </label>

        {mode === "edit" && form.adminLoginEmail ? (
          <label className="sa-label sm:col-span-2">
            {t("superAdmin.tenants.adminEmailLabel")}
            <input
              type="email"
              readOnly
              value={form.adminLoginEmail}
              className="sa-input bg-zinc-50 text-zinc-600"
            />
            <span className="mt-1 block text-[11px] text-zinc-500">
              {t("superAdmin.tenants.adminEmailHint")}
            </span>
          </label>
        ) : null}
      </div>

      {mode === "create" ? (
        <div className="mt-6 space-y-3 border-t border-zinc-100 pt-4">
          <h4 className="text-xs font-bold uppercase tracking-wide text-zinc-500">
            {t("superAdmin.tenants.firstAdminSection")}
          </h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sa-label">
              {t("superAdmin.common.firstName")}
              <input
                className="sa-input"
                value={adminFirstName}
                onChange={(e) => setAdminFirstName(e.target.value)}
              />
            </label>
            <label className="sa-label">
              {t("superAdmin.common.lastName")}
              <input
                className="sa-input"
                value={adminLastName}
                onChange={(e) => setAdminLastName(e.target.value)}
              />
            </label>
            <label className="sa-label sm:col-span-2">
              {t("superAdmin.tenants.adminEmailRequired")}
              <input
                type="email"
                required
                className="sa-input"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
            </label>
            <label className="sa-label sm:col-span-2">
              {t("superAdmin.tenants.adminPasswordRequired")}
              <input
                type="password"
                required
                className="sa-input"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                minLength={8}
              />
            </label>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
        <button type="submit" disabled={submitting} className="sa-btn-primary px-6">
          {submitting ? t("common.saving") : submitLabel}
        </button>
        {cancelHref ? (
          <SuperAdminOutlineLink href={cancelHref}>{t("common.cancel")}</SuperAdminOutlineLink>
        ) : (
          <Link href="/super-admin/tenants" className="sa-btn-outline">
            {t("common.cancel")}
          </Link>
        )}
      </div>
    </form>
  );
}
