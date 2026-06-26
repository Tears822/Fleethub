import type { ReactNode } from "react";
import { ShellCompanyScopeDropdown } from "./shell-company-scope-dropdown";

export function ShellPage({
  title,
  description,
  meta,
  actions,
  toolbarTrailing,
  children,
}: {
  title: string;
  description?: string;
  meta?: string;
  actions?: ReactNode;
  toolbarTrailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col space-y-3">
      <ShellPageHeader title={title} description={description} meta={meta} actions={actions} />
      {toolbarTrailing ? <ShellPageToolbar trailing={toolbarTrailing} /> : null}
      <div className="flex min-h-0 flex-1 flex-col gap-3">{children}</div>
    </section>
  );
}

export function ShellPageHeader({
  title,
  description,
  meta,
  actions,
}: {
  title: string;
  description?: string;
  meta?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="shrink-0 border-b border-zinc-200 pb-2">
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

export function ShellPageToolbar({ trailing }: { trailing?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <ShellCompanyScopeDropdown />
      {trailing ? (
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-initial">
          {trailing}
        </div>
      ) : null}
    </div>
  );
}
