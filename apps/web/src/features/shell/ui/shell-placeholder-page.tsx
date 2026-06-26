import type { ReactNode } from "react";
import { ShellPage } from "./shell-page";
import { VuiPanel } from "@/shared/ui/vui-panel";

/** Placeholder content for routes not wired to the API yet. */
export function ShellPlaceholderPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <ShellPage title={title} description={description}>
      <VuiPanel className="max-w-2xl space-y-4 p-6 text-sm leading-relaxed text-zinc-600">
        {children ?? (
          <p>
            Esta pantalla está reservada en el mapa de navegación. Los datos y tablas del prototipo se
            conectarán en hitos posteriores.
          </p>
        )}
      </VuiPanel>
    </ShellPage>
  );
}
