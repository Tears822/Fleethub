"use client";

import { useCallback, useState } from "react";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useToast } from "@/shared/ui/toast-provider";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function EmpresaLogoUpload({
  companyId,
  initialLogoUrl,
}: {
  companyId: string;
  initialLogoUrl: string | null;
}) {
  const toast = useToast();
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [uploading, setUploading] = useState(false);

  const displayUrl = logoUrl ? buildApiUrl(logoUrl) : null;

  const handleFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast.error("Selecciona un archivo de imagen.");
        return;
      }
      if (file.size > 512_000) {
        toast.error("La imagen debe ser menor de 512 KB.");
        return;
      }
      setUploading(true);
      try {
        const dataUrl = await fileToDataUrl(file);
        const res = await fetch(buildApiUrl(`/api/tenant/companies/${companyId}/logo`), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl }),
        });
        const data = (await res.json()) as { error?: string; logoUrl?: string };
        if (!res.ok) {
          toast.error(data.error ?? "No se pudo subir el logo");
          return;
        }
        setLogoUrl(data.logoUrl ?? logoUrl);
        toast.success("Logo actualizado. Aparecerá en el PDF de liquidación.");
      } catch {
        toast.error("No se pudo subir el logo.");
      } finally {
        setUploading(false);
      }
    },
    [companyId, logoUrl, toast],
  );

  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Logo (PDF liquidación)</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        {displayUrl ? (
          <img
            src={displayUrl}
            alt="Logo empresa"
            className="h-16 max-w-[8rem] rounded border border-zinc-200 bg-white object-contain p-1"
          />
        ) : (
          <div className="flex h-16 w-28 items-center justify-center rounded border border-zinc-200 bg-white text-[10px] text-zinc-400">
            Sin logo
          </div>
        )}
        <label className="erp-btn-outline cursor-pointer text-xs normal-case">
          {uploading ? "Subiendo…" : "Subir imagen"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">PNG, JPEG o WebP · máx. 512 KB</p>
    </div>
  );
}
