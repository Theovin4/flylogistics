import type { MetadataRoute } from "next";

const canonicalSiteUrl = "https://flylogistics.com.ng";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/api/", "/dashboard/", "/admin/", "/auth/", "/customer/", "/driver/", "/dispatcher/", "/cloud/dashboard", "/cloud/settings", "/cloud/drivers", "/cloud/shipments", "/cloud/customers", "/cloud/analytics", "/cloud/billing", "/login", "/register", "/payment/", "/fly-admin-ops/"]
      },
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard/", "/admin/", "/auth/", "/customer/", "/driver/", "/dispatcher/", "/cloud/dashboard", "/cloud/settings", "/cloud/drivers", "/cloud/shipments", "/cloud/customers", "/cloud/analytics", "/cloud/billing", "/login", "/register", "/payment/", "/fly-admin-ops/"]
      }
    ],
    host: canonicalSiteUrl,
    sitemap: `${canonicalSiteUrl}/sitemap.xml`
  };
}
