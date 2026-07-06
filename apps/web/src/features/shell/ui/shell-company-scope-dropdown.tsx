"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlignJustify, ChevronDown } from "lucide-react";
import {
  COMPANY_SCOPE_ALL,
  FH_COMPANY_SCOPE_COOKIE,
  formatCompanyScopeCookie,
} from "@/features/shell/lib/company-scope-cookie";
import { useCompanyScopeOptions } from "@/features/shell/ui/company-scope-provider";
import { useTranslations } from "@/shared/i18n/i18n-provider";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

export function ShellCompanyScopeDropdown() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslations();
  const { tenantId, companies, initialSelectedId, showFilter } = useCompanyScopeOptions();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const rootRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    if (!showFilter) return [];
    return [
      { id: COMPANY_SCOPE_ALL, label: t("billing.allCompanies") },
      ...companies,
    ];
  }, [companies, showFilter, t]);

  useEffect(() => {
    setSelectedId(initialSelectedId);
  }, [initialSelectedId]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const selected = useMemo(() => {
    if (!showFilter && companies.length === 1) {
      return companies[0]!;
    }
    return options.find((o) => o.id === selectedId) ?? options[0] ?? { id: COMPANY_SCOPE_ALL, label: t("nav.empresas") };
  }, [companies, options, selectedId, showFilter, t]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function applySelection(id: string) {
    setSelectedId(id);
    setOpen(false);
    const secure = typeof window !== "undefined" && window.location.protocol === "https:";
    const cookieValue =
      tenantId ? formatCompanyScopeCookie(tenantId, id) : id;
    document.cookie = `${FH_COMPANY_SCOPE_COOKIE}=${encodeURIComponent(cookieValue)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax${secure ? "; secure" : ""}`;
    router.refresh();
  }

  if (!showFilter) {
    if (companies.length === 1) {
      return (
        <span className="inline-flex min-h-[2.5rem] max-w-[14rem] items-center truncate rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-800">
          {selected.label}
        </span>
      );
    }
    return null;
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[2.5rem] min-w-[12rem] items-center gap-2 rounded-lg border border-zinc-900/90 bg-white px-3 py-2 text-left text-sm font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500/80"
      >
        <AlignJustify className="h-4 w-4 shrink-0 text-zinc-600" strokeWidth={2} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{selected.label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-500 transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Empresa"
          className="absolute left-0 top-[calc(100%+0.35rem)] z-50 min-w-[min(100vw-2rem,18rem)] overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-xl ring-1 ring-black/5"
        >
          {options.map((opt, index) => (
            <div key={opt.id}>
              <button
                type="button"
                role="option"
                aria-selected={opt.id === selectedId}
                onClick={() => applySelection(opt.id)}
                className={`flex w-full items-center px-3 py-2.5 text-left text-sm transition ${
                  opt.id === selectedId
                    ? "bg-orange-50 font-semibold text-orange-900"
                    : "text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {opt.label}
              </button>
              {index === 0 ? <div className="my-0.5 border-t border-zinc-100" role="separator" /> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
