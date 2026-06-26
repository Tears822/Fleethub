"use client";

import type { LucideIcon } from "lucide-react";
import { Building2, FolderOpen, Phone, Settings } from "lucide-react";
import type { ReactNode } from "react";
import {
  hasCompanyProfileData,
  type CompanyDocumentView,
  type CompanyProfile,
} from "@/features/companies/lib/company-profile";
import { EmpresaDocumentsSection } from "@/features/companies/ui/empresa-documents-section";
import { EmpresaEconomicoSection } from "@/features/companies/ui/empresa-economico-section";
import { EmpresaLicenciasDisplay } from "@/features/companies/ui/empresa-licencias-display";
import { VuiPanel } from "@/shared/ui/vui-panel";

export type EmpresaDetalleCompany = {
  id: string;
  legalName: string;
  taxId: string;
  isActive: boolean;
  driverCount: number;
  activeDrivers: number;
  licensedDrivers: number | null;
  platforms: string[];
  profile: CompanyProfile;
  documents: CompanyDocumentView[];
  canManageDocuments: boolean;
};

function SectionCard({
  title,
  icon: Icon,
  iconClass,
  children,
}: {
  title: string;
  icon: LucideIcon;
  iconClass: string;
  children: ReactNode;
}) {
  return (
    <VuiPanel className="p-4 md:p-5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900">
        <Icon className={`h-4 w-4 ${iconClass}`} aria-hidden />
        {title}
      </h3>
      <div className="mt-4 space-y-3">{children}</div>
    </VuiPanel>
  );
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="erp-label block">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function EmpresaDetalleView({ company }: { company: EmpresaDetalleCompany }) {
  const profile = company.profile;
  const hasProfile = hasCompanyProfileData(profile);

  return (
    <div className="space-y-4">
      {!hasProfile ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          Complete la ficha con <span className="font-medium">Editar empresa</span> para añadir
          dirección, contacto y datos bancarios.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Datos de la empresa" icon={Building2} iconClass="text-sky-600">
          <FieldRow label="Razón social">
            <input readOnly defaultValue={company.legalName} className="erp-input" />
          </FieldRow>
          <FieldRow label="NIF / CIF">
            <input readOnly defaultValue={company.taxId} className="erp-input font-mono text-sm" />
          </FieldRow>
          <FieldRow label="Dirección">
            <input readOnly defaultValue={profile.addressLine || "—"} className="erp-input" />
          </FieldRow>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldRow label="C.P.">
              <input readOnly defaultValue={profile.postalCode || "—"} className="erp-input" />
            </FieldRow>
            <FieldRow label="Población">
              <input readOnly defaultValue={profile.city || "—"} className="erp-input" />
            </FieldRow>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldRow label="Provincia">
              <input readOnly defaultValue={profile.province || "—"} className="erp-input" />
            </FieldRow>
            <FieldRow label="País">
              <input readOnly defaultValue={profile.country || "—"} className="erp-input" />
            </FieldRow>
          </div>
        </SectionCard>

        <SectionCard title="Contacto" icon={Phone} iconClass="text-red-600">
          <FieldRow label="Persona de contacto">
            <input readOnly defaultValue={profile.contactName || "—"} className="erp-input" />
          </FieldRow>
          <FieldRow label="Teléfono empresa">
            <input readOnly defaultValue={profile.phone || "—"} className="erp-input" />
          </FieldRow>
          <FieldRow label="Teléfono contacto">
            <input readOnly defaultValue={profile.contactPhone || "—"} className="erp-input" />
          </FieldRow>
          <FieldRow label="Email">
            <input readOnly defaultValue={profile.email || "—"} type="email" className="erp-input" />
          </FieldRow>
        </SectionCard>

        <SectionCard title="Datos bancarios" icon={Building2} iconClass="text-violet-600">
          <FieldRow label="IBAN">
            <input readOnly defaultValue={profile.iban || "—"} className="erp-input font-mono text-sm" />
          </FieldRow>
          <FieldRow label="Nota SEPA">
            <textarea
              readOnly
              defaultValue={profile.sepaNote || "—"}
              rows={3}
              className="erp-input resize-none"
            />
          </FieldRow>
        </SectionCard>

        <SectionCard title="Estado y plataformas" icon={Settings} iconClass="text-violet-600">
          <div className="flex items-center justify-between border-b border-zinc-100 py-2">
            <span className="text-xs text-zinc-500">Estado</span>
            {company.isActive ? (
              <span className="text-sm font-semibold text-emerald-600">Activa</span>
            ) : (
              <span className="text-sm font-semibold text-zinc-500">Inactiva</span>
            )}
          </div>
          <div className="flex items-center justify-between border-b border-zinc-100 py-2">
            <span className="text-xs text-zinc-500">Licencias (activos / contratadas)</span>
            <span className="text-sm">
              <EmpresaLicenciasDisplay
                activeDrivers={company.activeDrivers}
                licensedDrivers={company.licensedDrivers}
              />
            </span>
          </div>
          <div className="pt-2">
            <p className="text-xs text-zinc-500">Plataformas (conductores activos)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {company.platforms.length > 0 ? (
                company.platforms.map((pl) => (
                  <span
                    key={pl}
                    className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs font-medium text-zinc-700"
                  >
                    {pl}
                  </span>
                ))
              ) : (
                <span className="text-xs text-zinc-500">—</span>
              )}
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            Conductores vinculados:{" "}
            <span className="font-semibold text-zinc-800">{company.driverCount}</span>
          </p>
        </SectionCard>
      </div>

      <EmpresaEconomicoSection profile={profile} readOnly />

      <SectionCard title="Gestión documental" icon={FolderOpen} iconClass="text-pink-600">
        <p className="mb-3 text-xs text-zinc-600">
          Contratos y mandatos en PDF (máx. 5 MB). El administrador del tenant puede subir o retirar
          archivos (icono papelera). La copia retirada permanece en FleetHub hasta eliminación
          definitiva por Super Admin (auditoría / mandatos SEPA).
        </p>
        <EmpresaDocumentsSection
          companyId={company.id}
          initialDocuments={company.documents}
          canManage={company.canManageDocuments}
        />
      </SectionCard>
    </div>
  );
}
