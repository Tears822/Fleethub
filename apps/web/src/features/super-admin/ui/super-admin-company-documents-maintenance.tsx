"use client";

import { useCallback, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import type { CompanyDocumentMaintenanceView } from "@/features/companies/lib/company-profile";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";

export function SuperAdminCompanyDocumentsMaintenance({
  companyId,
  initialDocuments,
}: {
  companyId: string;
  initialDocuments: CompanyDocumentMaintenanceView[];
}) {
  const { t } = useTranslations();
  const toast = useToast();
  const [documents, setDocuments] = useState(initialDocuments);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pending = documents.filter((d) => d.pendingFleetHubPurge);

  const purge = useCallback(
    async (docId: string, title: string) => {
      if (!window.confirm(t("superAdmin.companies.documentsPurgeConfirm", { title }))) {
        return;
      }
      setBusyId(docId);
      try {
        const res = await fetch(
          buildApiUrl(
            `/api/super-admin/companies/${companyId}/documents/${docId}/purge`,
          ),
          { method: "POST", credentials: "include" },
        );
        const data = (await res.json()) as {
          error?: string;
          documents?: CompanyDocumentMaintenanceView[];
        };
        if (!res.ok) {
          toast.error(data.error ?? t("superAdmin.companies.documentsPurgeFailed"));
          return;
        }
        if (data.documents) setDocuments(data.documents);
        toast.success(t("superAdmin.companies.documentsPurgeSuccess"));
      } catch {
        toast.error(t("superAdmin.common.connectionError"));
      } finally {
        setBusyId(null);
      }
    },
    [companyId, t, toast],
  );

  if (pending.length === 0) {
    return <p className="text-xs text-zinc-600">{t("superAdmin.companies.documentsEmpty")}</p>;
  }

  return (
    <ul className="space-y-3">
      {pending.map((doc) => {
        const busy = busyId === doc.id;
        const retainedUrl = doc.retainedDownloadUrl
          ? buildApiUrl(doc.retainedDownloadUrl)
          : null;
        return (
          <li
            key={doc.id}
            className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-zinc-900">{doc.title}</p>
                <p className="mt-1 text-xs text-zinc-600">
                  {t("superAdmin.companies.documentsRetiredByTenant")}
                  {doc.deletedByTenantAt
                    ? t("superAdmin.companies.documentsRetiredOn", {
                        date: doc.deletedByTenantAt.slice(0, 10),
                      })
                    : ""}
                  {doc.retainedFileName ? ` · ${doc.retainedFileName}` : ""}
                </p>
              </div>
              <span className="text-[10px] font-bold uppercase text-amber-800">
                {t("superAdmin.companies.documentsPending")}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {retainedUrl ? (
                <a
                  href={retainedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sa-btn-outline inline-flex items-center text-xs"
                >
                  <Download className="mr-1 h-3.5 w-3.5" aria-hidden />
                  {t("superAdmin.companies.documentsDownload")}
                </a>
              ) : null}
              <button
                type="button"
                className="sa-btn-outline inline-flex items-center text-xs text-red-800 hover:border-red-300"
                disabled={busy}
                title={t("superAdmin.companies.documentsPurgeTitle")}
                onClick={() => void purge(doc.id, doc.title)}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                {busy ? t("superAdmin.common.deleting") : t("superAdmin.companies.documentsPurge")}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
