export type ConductorDetalleProfile = {
  dni: string;
  birthDate: string;
  phone: string;
  email: string;
  altaDate: string;
  license: string;
  vehicle: string;
  connectionStatus: string;
};

export function driverInitials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
