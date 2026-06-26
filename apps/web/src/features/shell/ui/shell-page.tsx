import type { ReactNode } from "react";
import { ShellCompanyScopeDropdown } from "./shell-company-scope-dropdown";

export function ShellPage({
  title,
  description,
  meta,
  actions,
  toolbarTrailing,
  fillViewport = false,
  children,
}: {
  title: string;
  description?: string;
  meta?: string;
  actions?: ReactNode;
  toolbarTrailing?: ReactNode;
  /** Fija cabecera de página y deja scroll solo en el contenido hijo (p. ej. listas de turnos). */
  fillViewport?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`flex flex-col space-y-3 ${fillViewport ? "min-h-0 flex-1" : ""}`}
    >
      <ShellPageHeader
        className={fillViewport ? "shrink-0" : undefined}
        title={title}
        description={description}
        meta={meta}
        actions={actions}
      />
      {toolbarTrailing ? (
        <ShellPageToolbar className={fillViewport ? "shrink-0" : undefined} trailing={toolbarTrailing} />
      ) : null}
      <div className={`flex flex-col gap-3 ${fillViewport ? "min-h-0 flex-1" : ""}`}>
        {children}
      </div>
    </section>
  );
}

export function ShellPageHeader({
  title,
  description,
  meta,
  actions,
  className,
}: {
  title: string;
  description?: string;
  meta?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`border-b border-zinc-200 pb-2 ${className ?? ""}`.trim()}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold tracking-tight text-zinc-900">{title}</h1>
          {description ? <p className="mt-0.5 text-sm text-zinc-600">{description}</p> : null}
          {meta ? <p className="mt-0.5 text-xs font-medium text-zinc-500">{meta}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function ShellPageToolbar({
  trailing,
  className,
}: {
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 ${className ?? ""}`.trim()}>
      <ShellCompanyScopeDropdown />
      {trailing ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-initial">
          {trailing}
        </div>
      ) : null}
    </div>
  );
}
