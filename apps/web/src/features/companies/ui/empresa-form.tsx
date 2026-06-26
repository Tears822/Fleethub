"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Building2, Phone } from "lucide-react";
import type { CompanyProfile } from "@/features/companies/lib/company-profile";
import { empresaPayloadFromForm } from "@/features/companies/lib/empresa-form-payload";
import { EmpresaLogoUpload } from "@/features/companies/ui/empresa-logo-upload";
import { EmpresaEconomicoSection } from "@/features/companies/ui/empresa-economico-section";
import { buildApiUrl, resolveApiFetchUrl } from "@/shared/lib/api-url";
import { VuiPanel } from "@/shared/ui/vui-panel";
import { useToast } from "@/shared/ui/toast-provider";

export type EmpresaFormValues = {
  id?: string;
  legalName: string;
  taxId: string | null;
  logoUrl?: string | null;
  isActive: boolean;
  profile?: CompanyProfile;
};

export function EmpresaForm({
  mode,
  initial,
  createApiUrl,
  patchApiUrl,
  onCreateSuccess,
  onEditSuccess,
  cancelHref,
  submitLabel,
}: {
  mode: "create" | "edit";
  initial?: EmpresaFormValues;
  /** When set, POST create uses this URL (e.g. Super Admin adds company to a tenant). */
  createApiUrl?: string;
  /** When set, PATCH edit uses this URL (Super Admin). */
  patchApiUrl?: string;
  /** After create via `createApiUrl`; skips redirect to /empresas. */
  onCreateSuccess?: (companyId: string) => void;
  /** After edit via `patchApiUrl`; skips redirect to /empresas. */
  onEditSuccess?: () => void;
  cancelHref?: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const p = initial?.profile;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const payload = empresaPayloadFromForm(new FormData(e.currentTarget));
    if (!payload.legalName) {
      toast.error("La razón social es obligatoria.");
      return;
    }
    if (!payload.taxId?.trim()) {
      toast.error("El NIF / CIF es obligatorio.");
      return;
    }

    setSaving(true);
    try {
      const url = resolveApiFetchUrl(
        mode === "create"
          ? (createApiUrl ?? "/api/tenant/companies")
          : (patchApiUrl ?? `/api/tenant/companies/${initial!.id}`),
      );
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string; companyId?: string };
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo guardar la empresa");
        return;
      }
      toast.success(mode === "create" ? "Empresa creada." : "Empresa actualizada.");
      if (mode === "create" && onCreateSuccess && data.companyId) {
        onCreateSuccess(data.companyId);
        router.refresh();
        return;
      }
      if (mode === "edit" && onEditSuccess) {
        onEditSuccess();
        router.refresh();
        return;
      }
      if (mode === "edit" && patchApiUrl) {
        router.push(cancelHref ?? "/super-admin/empresas");
        router.refresh();
        return;
      }
      const targetId = mode === "create" ? data.companyId : initial!.id;
      router.push(targetId ? `/empresas/${targetId}` : "/empresas");
      router.refresh();
    } catch {
      toast.error("Error de conexión al guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="max-w-2xl space-y-4">
      <VuiPanel className="p-4 md:p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900">
          <Building2 className="h-4 w-4 text-violet-600" aria-hidden />
          Datos de la empresa
        </h3>
        <div className="mt-4 space-y-3">
          <label className="erp-label block">
            Razón social <span className="text-red-500">*</span>
            <input
              name="legalName"
              className="erp-input mt-1 w-full"
              required
              defaultValue={initial?.legalName ?? ""}
            />
          </label>
          <label className="erp-label block">
            NIF / CIF {mode === "create" ? <span className="text-red-500">*</span> : null}
            <input
              name="taxId"
              className="erp-input mt-1 w-full font-mono text-sm"
              required={mode === "create"}
              defaultValue={initial?.taxId ?? ""}
              placeholder={mode === "create" ? "B12345678" : "Opcional en edición"}
            />
          </label>
          <label className="erp-label block">
            Licencias contratadas
            <input
              name="licensedDrivers"
              type="number"
              min={0}
              step={1}
              className="erp-input mt-1 w-full max-w-[9rem] tabular-nums"
              defaultValue={
                p?.licensedDrivers != null ? String(p.licensedDrivers) : ""
              }
              placeholder="Sin cupo"
            />
            <span className="mt-1 block text-[11px] font-normal text-zinc-500">
              Cupo de conductores activos. Vacío = sin límite en el listado de empresas.
            </span>
          </label>
          <label className="erp-label block">
            Dirección
            <input
              name="addressLine"
              className="erp-input mt-1 w-full"
              defaultValue={p?.addressLine ?? ""}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="erp-label block">
              C.P.
              <input
                name="postalCode"
                className="erp-input mt-1 w-full"
                defaultValue={p?.postalCode ?? ""}
              />
            </label>
            <label className="erp-label block">
              Población
              <input name="city" className="erp-input mt-1 w-full" defaultValue={p?.city ?? ""} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="erp-label block">
              Provincia
              <input
                name="province"
                className="erp-input mt-1 w-full"
                defaultValue={p?.province ?? ""}
              />
            </label>
            <label className="erp-label block">
              País
              <input
                name="country"
                className="erp-input mt-1 w-full"
                defaultValue={p?.country ?? "España"}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={initial?.isActive !== false}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Empresa activa
          </label>
          {mode === "edit" && initial?.id ? (
            <EmpresaLogoUpload companyId={initial.id} initialLogoUrl={initial.logoUrl ?? null} />
          ) : null}
        </div>
      </VuiPanel>

      <VuiPanel className="p-4 md:p-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900">
          <Phone className="h-4 w-4 text-red-600" aria-hidden />
          Contacto y banco
        </h3>
        <div className="mt-4 space-y-3">
          <label className="erp-label block">
            Persona de contacto
            <input
              name="contactName"
              className="erp-input mt-1 w-full"
              defaultValue={p?.contactName ?? ""}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="erp-label block">
              Teléfono empresa
              <input
                name="phone"
                type="tel"
                className="erp-input mt-1 w-full"
                defaultValue={p?.phone ?? ""}
              />
            </label>
            <label className="erp-label block">
              Teléfono contacto
              <input
                name="contactPhone"
                type="tel"
                className="erp-input mt-1 w-full"
                defaultValue={p?.contactPhone ?? ""}
              />
            </label>
          </div>
          <label className="erp-label block">
            Email
            <input
              name="email"
              type="email"
              className="erp-input mt-1 w-full"
              defaultValue={p?.email ?? ""}
            />
          </label>
          <label className="erp-label block">
            IBAN
            <input
              name="iban"
              className="erp-input mt-1 w-full font-mono text-sm"
              defaultValue={p?.iban ?? ""}
            />
          </label>
          <label className="erp-label block">
            Nota SEPA
            <textarea
              name="sepaNote"
              rows={2}
              className="erp-input mt-1 w-full resize-none"
              defaultValue={p?.sepaNote ?? ""}
            />
          </label>
        </div>
      </VuiPanel>

      <EmpresaEconomicoSection profile={p} />

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="erp-btn-primary" disabled={saving}>
          {saving
            ? "Guardando…"
            : submitLabel ?? (mode === "create" ? "Crear empresa" : "Guardar cambios")}
        </button>
        {cancelHref ? (
          <a href={cancelHref} className="erp-btn-outline inline-flex items-center">
            Cancelar
          </a>
        ) : null}
      </div>
    </form>
  );
}
