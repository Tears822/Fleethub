"use client";

import { useCallback, useState } from "react";
import { Download, Trash2, Upload } from "lucide-react";
import type { CompanyDocumentView } from "@/features/companies/lib/company-profile";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useToast } from "@/shared/ui/toast-provider";

const TENANT_DELETE_CONFIRM =
  "¿Eliminar el PDF subido? El archivo dejará de mostrarse en su panel y podrá subir uno nuevo. FleetHub conservará una copia para auditoría hasta que el equipo FleetHub la elimine de forma definitiva (p. ej. mandatos SEPA y justificación ante el banco).";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function EmpresaDocumentsSection({
  companyId,
  initialDocuments,
  canManage,
}: {
  companyId: string;
  initialDocuments: CompanyDocumentView[];
  canManage: boolean;
}) {
  const toast = useToast();
  const [documents, setDocuments] = useState(initialDocuments);
  const [busyId, setBusyId] = useState<string | null>(null);

  const upload = useCallback(
    async (docId: string, file: File) => {
      if (file.type !== "application/pdf") {
        toast.error("Solo se permiten archivos PDF.");
        return;
      }
      if (file.size > 5_242_880) {
        toast.error("El PDF debe ser menor de 5 MB.");
        return;
      }
      setBusyId(docId);
      try {
        const dataUrl = await fileToDataUrl(file);
        const res = await fetch(
          buildApiUrl(`/api/tenant/companies/${companyId}/documents/${docId}`),
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataUrl, fileName: file.name }),
          },
        );
        const data = (await res.json()) as {
          error?: string;
          documents?: CompanyDocumentView[];
        };
        if (!res.ok) {
          toast.error(data.error ?? "No se pudo subir el documento");
          return;
        }
        if (data.documents) setDocuments(data.documents);
        toast.success("Documento subido correctamente.");
      } catch {
        toast.error("Error al subir el documento.");
      } finally {
        setBusyId(null);
      }
    },
    [companyId, toast],
  );

  const removeUpload = useCallback(
    async (docId: string) => {
      if (!window.confirm(TENANT_DELETE_CONFIRM)) return;
      setBusyId(docId);
      try {
        const res = await fetch(
          buildApiUrl(`/api/tenant/companies/${companyId}/documents/${docId}`),
          {
            method: "DELETE",
            credentials: "include",
          },
        );
        const data = (await res.json()) as {
          error?: string;
          documents?: CompanyDocumentView[];
        };
        if (!res.ok) {
          toast.error(data.error ?? "No se pudo eliminar el documento");
          return;
        }
        if (data.documents) setDocuments(data.documents);
        toast.success(
          "Documento retirado. Puede subir un PDF nuevo. FleetHub conserva el archivo para auditoría.",
        );
      } catch {
        toast.error("Error de conexión.");
      } finally {
        setBusyId(null);
      }
    },
    [companyId, toast],
  );

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {documents.map((doc) => {
        const busy = busyId === doc.id;
        const downloadUrl = doc.fileUrl ? buildApiUrl(doc.fileUrl) : null;
        return (
          <div key={doc.id} className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-bold text-zinc-900">{doc.title}</p>
              <span
                className={
                  doc.status === "signed"
                    ? "text-[10px] font-bold uppercase text-emerald-600"
                    : "text-[10px] font-bold uppercase text-amber-600"
                }
              >
                {doc.statusLabel}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-zinc-600">{doc.detail}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {downloadUrl ? (
                <a
                  href={downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="erp-btn-outline inline-flex items-center px-2 py-1 text-[10px]"
                >
                  <Download className="mr-1 inline h-3 w-3" aria-hidden />
                  Descargar
                </a>
              ) : (
                <button type="button" className="erp-btn-outline px-2 py-1 text-[10px]" disabled>
                  <Download className="mr-1 inline h-3 w-3" aria-hidden />
                  Descargar
                </button>
              )}
              {canManage ? (
                <label
                  className={`erp-btn-outline inline-flex cursor-pointer items-center px-2 py-1 text-[10px] ${busy ? "opacity-50" : ""}`}
                >
                  <Upload className="mr-1 inline h-3 w-3" aria-hidden />
                  {busy ? "Subiendo…" : "Subir PDF"}
                  <input
                    type="file"
                    accept="application/pdf"
                    className="sr-only"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void upload(doc.id, file);
                    }}
                  />
                </label>
              ) : null}
              {canManage && doc.canDeleteUpload ? (
                <button
                  type="button"
                  className="erp-btn-outline inline-flex items-center px-2 py-1 text-[10px] text-red-700 hover:border-red-300 hover:bg-red-50"
                  disabled={busy}
                  title="Eliminar PDF subido"
                  aria-label={`Eliminar PDF de ${doc.title}`}
                  onClick={() => void removeUpload(doc.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
