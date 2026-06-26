import type { TenantCommercialStatus } from "@fleethub/db";
import { billingPlanFromTenantSettings } from "@fleethub/auth";

export type TenantPlan = "Starter" | "Pro" | "Enterprise";

export type SuperAdminTenantFormValues = {
  id: string;
  name: string;
  slug: string;
  taxId: string;
  phone: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
  province: string;
  country: string;
  contactPerson: string;
  contactPhone: string;
  iban: string;
  manager: string;
  plan: ReturnType<typeof billingPlanFromTenantSettings>;
  active: boolean;
  commercialStatus: TenantCommercialStatus;
  trialEndsAt: string;
  adminLoginEmail: string;
};

export const EMPTY_TENANT_FORM: Omit<SuperAdminTenantFormValues, "id" | "slug"> = {
  name: "",
  taxId: "",
  phone: "",
  email: "",
  address: "",
  postalCode: "",
  city: "",
  province: "",
  country: "España",
  contactPerson: "",
  contactPhone: "",
  iban: "",
  manager: "",
  plan: "Starter",
  active: true,
  commercialStatus: "TRIAL",
  trialEndsAt: "",
  adminLoginEmail: "",
};
