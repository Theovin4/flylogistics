"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { tenantCssVariables, type TenantBrandProfile } from "@/lib/tenant-branding";

type CloudTenantContextValue = {
  company: TenantBrandProfile | null;
  role: string | null;
  setCompany: (company: TenantBrandProfile | null) => void;
};

const CloudTenantContext = createContext<CloudTenantContextValue | null>(null);

export function CloudTenantProvider({ company: initialCompany, role, children }: { company: TenantBrandProfile | null; role: string | null; children: ReactNode }) {
  const [company, setCompany] = useState(initialCompany);
  const value = useMemo(() => ({ company, role, setCompany }), [company, role]);
  return <CloudTenantContext.Provider value={value}><div data-cloud-tenant={company?.slug ?? undefined} style={tenantCssVariables(company)}>{children}</div></CloudTenantContext.Provider>;
}

export function useCloudTenant() {
  return useContext(CloudTenantContext) ?? { company: null, role: null, setCompany: () => undefined };
}
