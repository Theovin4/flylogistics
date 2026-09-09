import type { Metadata } from "next";
import { siteConfig, type PublicPageConfig } from "@/lib/site";

type MetadataInput = {
  title: string;
  description: string;
  path?: string;
  keywords?: string[];
  noIndex?: boolean;
};

const privateExactPaths = new Set([
  "/login",
  "/register",
  "/instant-quote"
]);

const privatePathPrefixes = [
  "/api/",
  "/admin/",
  "/auth/",
  "/customer/",
  "/dashboard/",
  "/dispatcher/",
  "/driver/",
  "/fly-admin-ops/",
  "/merchant/dashboard",
  "/payment/",
  "/rider/",
  "/cloud/analytics",
  "/cloud/billing",
  "/cloud/customers",
  "/cloud/dashboard",
  "/cloud/drivers",
  "/cloud/login",
  "/cloud/settings",
  "/cloud/shipments",
  "/cloud/signup"
];

function normalizePath(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return normalizedPath.length > 1 ? normalizedPath.replace(/\/+$/, "") : normalizedPath;
}

function shouldNoIndexPath(path: string) {
  const normalizedPath = normalizePath(path);
  return privateExactPaths.has(normalizedPath) || privatePathPrefixes.some((prefix) => normalizedPath === prefix.replace(/\/+$/, "") || normalizedPath.startsWith(prefix));
}

export function absoluteUrl(path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, siteConfig.url).toString();
}

export function createMetadata({ title, description, path = "/", keywords = [], noIndex = false }: MetadataInput): Metadata {
  const url = absoluteUrl(path);
  const isNoIndex = noIndex || shouldNoIndexPath(path);

  return {
    title,
    description,
    keywords: [
      "Fly Logistics",
      "Nigeria logistics company",
      "Lagos delivery service",
      "logistics company",
      "shipment tracking",
      "same-day delivery",
      "interstate delivery",
      "business logistics",
      "freight management",
      "delivery services",
      "AI logistics platform",
      ...keywords
    ],
    alternates: {
      canonical: url
    },
    robots: isNoIndex
      ? { index: false, follow: false, googleBot: { index: false, follow: false } }
      : { index: true, follow: true, googleBot: { index: true, follow: true } },
    openGraph: {
      type: "website",
      locale: "en_US",
      url,
      title,
      description,
      siteName: siteConfig.name,
      images: [{ url: absoluteUrl("/opengraph-image"), width: 1200, height: 630, alt: `${siteConfig.name} logistics platform` }]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [absoluteUrl("/opengraph-image")]
    }
  };
}

export function publicPageMetadata(page: PublicPageConfig): Metadata {
  return createMetadata({
    title: page.title,
    description: page.description,
    path: `/${page.slug}`,
    keywords: [page.eyebrow, page.serviceType ?? "logistics service", page.areaServed ?? "delivery operations"]
  });
}

export function logisticsBusinessJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": ["Organization", "LocalBusiness"],
    name: siteConfig.name,
    url: siteConfig.url,
    logo: absoluteUrl("/logo.svg"),
    image: absoluteUrl("/opengraph-image"),
    description: siteConfig.description,
    address: {
      "@type": "PostalAddress",
      streetAddress: siteConfig.contact.address,
      addressLocality: "Lagos",
      addressRegion: "Lagos",
      addressCountry: "NG"
    },
    email: siteConfig.contact.supportEmail,
    telephone: siteConfig.contact.supportPhone,
    areaServed: ["Lagos", "Abuja", "Ogun", "Port Harcourt", "Nigeria", "West Africa", "Africa", "United Kingdom", "United States", "Canada", "Europe", "Global"],
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: siteConfig.contact.supportEmail,
        telephone: siteConfig.contact.supportPhone,
        url: absoluteUrl("/contact"),
        availableLanguage: ["English"]
      },
      {
        "@type": "ContactPoint",
        contactType: "sales",
        email: siteConfig.contact.supportEmail,
        telephone: siteConfig.contact.supportPhone,
        url: absoluteUrl("/quote"),
        availableLanguage: ["English"]
      }
    ],
    makesOffer: [
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Same-day delivery" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Interstate delivery" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "International import shipping" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "International export shipping" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Worldwide freight forwarding" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Business logistics" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "Warehouse services" } },
      { "@type": "Offer", itemOffered: { "@type": "Service", name: "AI-powered logistics" } }
    ]
  };
}

export function serviceJsonLd(page: PublicPageConfig) {
  const serviceName = page.serviceType ?? page.eyebrow;
  const pageUrl = absoluteUrl(`/${page.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${pageUrl}#service`,
    name: serviceName,
    serviceType: page.serviceType ?? page.title,
    provider: {
      "@type": "Organization",
      name: siteConfig.name,
      url: siteConfig.url
    },
    areaServed: page.areaServed ?? "Global",
    description: page.description,
    url: pageUrl,
    audience: {
      "@type": "Audience",
      audienceType: "Customers, merchants, logistics teams, and business shippers"
    },
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      priceCurrency: "NGN",
      url: absoluteUrl("/quote"),
      itemOffered: {
        "@type": "Service",
        name: serviceName
      }
    },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: `${siteConfig.name} logistics services`,
      itemListElement: [
        "Pickup coordination",
        "Delivery price estimate",
        "Shipment tracking",
        "Customer notifications",
        "Delivery confirmation"
      ].map((name) => ({
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: `${serviceName} - ${name}`
        }
      }))
    }
  };
}

export function breadcrumbJsonLd(items: readonly { name: string; href: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.href)
    }))
  };
}

export function faqJsonLd(faqs: PublicPageConfig["faqs"]) {
  if (!faqs?.length) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer
      }
    }))
  };
}
