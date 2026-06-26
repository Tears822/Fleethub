"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Smartphone, Truck, User } from "lucide-react";
import {
  birthDateInputValue,
  driverPayloadFromForm,
  type DriverFormInitial,
} from "@/features/drivers/lib/driver-form-payload";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";
import { VuiPanel } from "@/shared/ui/vui-panel";

export type ConductorEditCompany = { id: string; legalName: string };

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
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="erp-label block">
      {label}
      {required ? <span className="text-red-500"> *</span> : null}
      {children}
    </label>
  );
}

export function ConductorEditForm({
  driver,
  companies,
}: {
  driver: DriverFormInitial;
  companies: ConductorEditCompany[];
}) {
  const router = useRouter();
  const toast = useToast();
  const { t } = useTranslations();
  const [platformUber, setPlatformUber] = useState(driver.platforms.includes("UBER"));
  const [platformFreenow, setPlatformFreenow] = useState(driver.platforms.includes("FREENOW"));
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const platforms: string[] = [];
    if (platformUber) platforms.push("UBER");
    if (platformFreenow) platforms.push("FREENOW");
    const payload = driverPayloadFromForm(form, platforms);

    if (!payload.fullName) {
      toast.error(t("conductores.form.nameRequired"));
      return;
    }
    if (!payload.companyId) {
      toast.error(t("conductores.form.companyRequired"));
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(buildApiUrl(`/api/tenant/drivers/${driver.id}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("conductores.form.saveError"));
        return;
      }
      toast.success(t("conductores.form.updated"));
      router.push(`/conductores/${driver.id}`);
      router.refresh();
    } catch {
      toast.error(t("conductores.form.saveConnectionError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <FormCard title={t("conductores.form.personalData")} icon={User}>
          <Field label={t("conductores.form.fullName")} required>
            <input
              name="fullName"
              required
              defaultValue={driver.fullName}
              className="erp-input mt-1"
            />
          </Field>
          <Field label={t("conductores.form.dni")}>
            <input name="dni" defaultValue={driver.dni ?? ""} className="erp-input mt-1" />
          </Field>
          <Field label={t("conductores.form.birthDate")}>
            <input
              name="birthDate"
              type="date"
              defaultValue={birthDateInputValue(
                driver.birthDate ? new Date(driver.birthDate) : null,
              )}
              className="erp-input mt-1"
            />
          </Field>
          <Field label={t("conductores.form.phone")}>
            <input name="phone" type="tel" defaultValue={driver.phone ?? ""} className="erp-input mt-1" />
          </Field>
          <Field label={t("conductores.form.email")}>
            <input
              name="email"
              type="email"
              defaultValue={driver.email ?? ""}
              className="erp-input mt-1"
            />
          </Field>
        </FormCard>

        <FormCard title={t("conductores.form.workData")} icon={Truck}>
          <Field label={t("conductores.form.company")} required>
            <select
              name="companyId"
              required
              className="erp-input mt-1"
              defaultValue={driver.companyId}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legalName}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("conductores.form.license")}>
            <input
              name="license"
              defaultValue={driver.licenseNumber ?? ""}
              className="erp-input mt-1"
            />
          </Field>
          <Field label={t("conductores.form.plate")}>
            <input name="plate" defaultValue={driver.vehiclePlate ?? ""} className="erp-input mt-1" />
          </Field>
          <Field label={t("conductores.form.vehicleModel")}>
            <input
              name="vehicleModel"
              defaultValue={driver.vehicleModel ?? ""}
              className="erp-input mt-1"
            />
          </Field>
          <Field label={t("conductores.form.status")}>
            <select
              name="status"
              className="erp-input mt-1"
              defaultValue={driver.isActive ? "active" : "inactive"}
            >
              <option value="active">{t("conductores.active")}</option>
              <option value="inactive">{t("conductores.inactive")}</option>
            </select>
          </Field>
        </FormCard>

        <FormCard title={t("conductores.form.platforms")} icon={Smartphone}>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={platformUber}
              onChange={(e) => setPlatformUber(e.target.checked)}
              className="h-4 w-4"
            />
            Uber
          </label>
          {platformUber ? (
            <Field label={t("conductores.form.uberDriverUuid")}>
              <input
                name="uberExternalDriverId"
                defaultValue={driver.uberExternalDriverId ?? ""}
                placeholder="e.g. 05ffedf7-7660-…"
                className="erp-input mt-1 font-mono text-xs"
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-zinc-500">{t("conductores.form.uberDriverUuidHint")}</p>
            </Field>
          ) : null}
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={platformFreenow}
              onChange={(e) => setPlatformFreenow(e.target.checked)}
              className="h-4 w-4"
            />
            FreeNow
          </label>
          {platformFreenow ? (
            <Field label={t("conductores.form.freenowDriverId")}>
              <input
                name="freenowExternalDriverId"
                defaultValue={driver.freenowExternalDriverId ?? ""}
                placeholder="e.g. GYZDOMBRHEZDQ"
                className="erp-input mt-1 font-mono text-xs"
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-zinc-500">{t("conductores.form.freenowDriverIdHint")}</p>
            </Field>
          ) : null}
        </FormCard>
      </div>

      <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
        <button
          type="button"
          onClick={() => router.push(`/conductores/${driver.id}`)}
          className="erp-btn-outline px-5 py-2 text-xs"
        >
          {t("common.cancel")}
        </button>
        <button type="submit" className="erp-btn-primary px-6" disabled={saving}>
          {saving ? t("common.saving") : t("account.saveChanges")}
        </button>
      </div>
    </form>
  );
}
