export function driverPayloadFromForm(form: FormData, platforms: string[]) {
  return {
    fullName: String(form.get("fullName") ?? "").trim(),
    companyId: String(form.get("companyId") ?? "").trim(),
    isActive: String(form.get("status") ?? "active") === "active",
    platforms,
    dni: String(form.get("dni") ?? "").trim() || null,
    phone: String(form.get("phone") ?? "").trim() || null,
    email: String(form.get("email") ?? "").trim() || null,
    birthDate: String(form.get("birthDate") ?? "").trim() || null,
    licenseNumber: String(form.get("license") ?? "").trim() || null,
    vehiclePlate: String(form.get("plate") ?? "").trim() || null,
    vehicleModel: String(form.get("vehicleModel") ?? "").trim() || null,
    uberExternalDriverId:
      String(form.get("uberExternalDriverId") ?? "").trim() || null,
    freenowExternalDriverId:
      String(form.get("freenowExternalDriverId") ?? "").trim() || null,
  };
}

export type DriverFormInitial = {
  id: string;
  fullName: string;
  companyId: string;
  isActive: boolean;
  dni: string | null;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  licenseNumber: string | null;
  vehiclePlate: string | null;
  vehicleModel: string | null;
  platforms: Array<"UBER" | "FREENOW">;
  uberExternalDriverId?: string | null;
  freenowExternalDriverId?: string | null;
};

export function birthDateInputValue(iso: Date | null | undefined): string {
  if (!iso) return "";
  return iso.toISOString().slice(0, 10);
}
