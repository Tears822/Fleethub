export type ConnectionDot = "online" | "offline" | "unknown";

export function connectionDotLabel(dot: ConnectionDot): string {
  if (dot === "online") return "Conectado";
  if (dot === "offline") return "Desconectado";
  return "Sin dato reciente";
}
