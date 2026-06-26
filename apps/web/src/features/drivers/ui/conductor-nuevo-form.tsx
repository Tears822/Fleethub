"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Smartphone, Truck, User } from "lucide-react";
import { VuiPanel } from "@/shared/ui/vui-panel";
import { driverPayloadFromForm } from "@/features/drivers/lib/driver-form-payload";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";

export type ConductorNuevoCompany = {
  id: string;
  legalName: string;
};

function FormCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof User;
  children: ReactNode;
}) {
  return (
    <VuiPanel className="p-4 md:p-5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900">
        <Icon className="h-4 w-4 text-violet-600" aria-hidden />
        {title}
      </h3>
      <div className="mt-4 space-y-3">{children}</div>
    </VuiPanel>
  );
}

function Field({
  label,
  required,
  children,
  className = "",
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`erp-label block ${className}`.trim()}>
      {label}
      {required ? <span className="text-red-500"> *</span> : null}
      {children}
    </label>
  );
}

export function ConductorNuevoForm({ companies }: { companies: ConductorNuevoCompany[] }) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useTranslations();
  const [platformUber, setPlatformUber] = useState(false);
  const [platformFreenow, setPlatformFreenow] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("fullName") ?? "").trim();
    const companyId = String(form.get("companyId") ?? "").trim();
    if (!name) {
      toast.error(t("conductores.form.nameRequired"));
      return;
    }
    if (!companyId) {
      toast.error(t("conductores.form.companyRequired"));
      return;
    }

    const platforms: string[] = [];
    if (platformUber) platforms.push("UBER");
    if (platformFreenow) platforms.push("FREENOW");

    setSaving(true);
    try {
      const res = await fetch(buildApiUrl("/api/tenant/drivers"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(driverPayloadFromForm(form, platforms)),
      });
      const data = (await res.json()) as { error?: string; driverId?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("conductores.form.createError"));
        return;
      }
      toast.success(t("conductores.form.created"));
      router.push("/conductores");
      router.refresh();
    } catch {
      toast.error(t("conductores.form.createConnectionError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <FormCard title={t("conductores.form.personalData")} icon={User}>
          <Field label={t("conductores.form.fullName")} required className="sm:col-span-2">
            <input
              name="fullName"
              required
              placeholder={t("conductores.form.fullNamePlaceholder")}
              className="erp-input mt-1"
            />
          </Field>
          <Field label={t("conductores.form.dni")}>
            <input name="dni" placeholder={t("conductores.form.dniPlaceholder")} className="erp-input mt-1" />
          </Field>
          <Field label={t("conductores.form.birthDate")}>
            <input name="birthDate" type="date" className="erp-input mt-1" />
          </Field>
          <Field label={t("conductores.form.phone")}>
            <input
              name="phone"
              type="tel"
              placeholder={t("conductores.form.phonePlaceholder")}
              className="erp-input mt-1"
            />
          </Field>
          <Field label={t("conductores.form.email")}>
            <input
              name="email"
              type="email"
              placeholder={t("conductores.form.emailPlaceholder")}
              className="erp-input mt-1"
            />
          </Field>
        </FormCard>

        <FormCard title={t("conductores.form.workData")} icon={Truck}>
          <Field label={t("conductores.form.company")} required>
            <select name="companyId" required className="erp-input mt-1" defaultValue="">
              <option value="" disabled>
                {t("conductores.form.selectCompany")}
              </option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legalName}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("conductores.form.license")}>
            <input name="license" placeholder={t("conductores.form.licensePlaceholder")} className="erp-input mt-1" />
          </Field>
          <Field label={t("conductores.form.plate")}>
            <input name="plate" placeholder={t("conductores.form.platePlaceholder")} className="erp-input mt-1" />
          </Field>
          <Field label={t("conductores.form.vehicleModel")}>
            <input
              name="vehicleModel"
              placeholder={t("conductores.form.vehicleModelPlaceholder")}
              className="erp-input mt-1"
            />
          </Field>
          <Field label={t("conductores.form.status")}>
            <select name="status" className="erp-input mt-1" defaultValue="active">
              <option value="active">{t("conductores.active")}</option>
              <option value="inactive">{t("conductores.inactive")}</option>
            </select>
          </Field>
        </FormCard>

        <FormCard title={t("conductores.form.platforms")} icon={Smartphone}>
          <p className="text-xs text-zinc-500">{t("conductores.form.platformsHint")}</p>
          <div className="space-y-2 pt-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                checked={platformUber}
                onChange={(e) => setPlatformUber(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-orange-500 focus:ring-orange-400/30"
              />
              Uber
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                checked={platformFreenow}
                onChange={(e) => setPlatformFreenow(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-red-600 focus:ring-red-400/30"
              />
              FreeNow
            </label>
          </div>
          <input type="hidden" name="platformUber" value={platformUber ? "1" : "0"} />
          <input type="hidden" name="platformFreenow" value={platformFreenow ? "1" : "0"} />
        </FormCard>
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 pt-4">
        <button
          type="button"
          onClick={() => router.push("/conductores")}
          className="erp-btn-outline px-5 py-2 text-xs"
        >
          {t("common.cancel")}
        </button>
        <button type="submit" className="erp-btn-primary px-6" disabled={saving}>
          {saving ? t("common.saving") : t("conductores.form.createDriver")}
        </button>
      </div>
    </form>
  );
}
