import type { Metadata, Viewport } from "next";
import type * as React from "react";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Toaster } from "sonner";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { siteConfig } from "@/lib/site";
import { JsonLd } from "@/components/seo/json-ld";
import { logisticsBusinessJsonLd } from "@/lib/seo";
import { AnalyticsScripts } from "@/components/analytics/analytics-scripts";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap"
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap"
});

const metaPixelId = (process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "2062991460969957").trim();
const validMetaPixelId = /^\d{8,20}$/.test(metaPixelId) ? metaPixelId : "2062991460969957";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: "Fly Logistics - Nigeria Logistics Company for Delivery, Freight, and Tracking",
    template: "%s | Fly Logistics"
  },
  description:
    "Fly Logistics provides local delivery, interstate freight, international import and export shipping, warehousing, live tracking, smart quotes, and business logistics support across Nigeria and global lanes.",
  keywords: [
    "AI logistics",
    "Nigeria logistics company",
    "international shipping from Nigeria",
    "global freight solutions",
    "air freight services",
    "ocean freight services",
    "Lagos delivery service",
    "Abuja logistics",
    "freight platform",
    "fleet management",
    "supply chain",
    "warehouse management",
    "route optimization",
    "shipment tracking"
  ],
  authors: [{ name: "Fly Logistics" }],
  creator: "Fly Logistics",
  publisher: "Fly Logistics",
  category: "Logistics",
  classification: "Business logistics, delivery, warehousing, shipment tracking, AI logistics",
  alternates: {
    canonical: siteConfig.url
  },
  verification: {
    google: "KkO1C4c8bxgmEBRKYl-EOspUpwfBT4yustVIkEu9pIE"
  },
  other: {
    "google-adsense-account": "ca-pub-1037358753872630",
    "facebook-domain-verification": "o1zohv8fqtihca4xq7v6q1yl05bbg7"
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteConfig.url,
    title: "Fly Logistics",
    description: siteConfig.description,
    siteName: "Fly Logistics",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Fly Logistics platform" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Fly Logistics",
    description: siteConfig.description,
    images: ["/opengraph-image"]
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/meta-app-icon-1024.png", sizes: "1024x1024", type: "image/png" }
    ],
    shortcut: "/favicon.svg",
    apple: { url: "/icons/meta-app-icon-1024.png", sizes: "1024x1024", type: "image/png" }
  },
  manifest: "/site.webmanifest"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#090b12" }
  ]
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <Script id="fly-meta-pixel-base" strategy="beforeInteractive">
          {`
            (function () {
              var privatePrefixes = ['/admin', '/auth', '/customer', '/dashboard', '/dispatcher', '/driver', '/fly-admin-ops', '/login', '/register', '/rider'];
              var path = window.location.pathname;
              var privateRoute = privatePrefixes.some(function (prefix) { return path === prefix || path.indexOf(prefix + '/') === 0; })
                || path === '/merchant/dashboard' || path.indexOf('/merchant/dashboard/') === 0
                || ['/cloud/analytics', '/cloud/billing', '/cloud/customers', '/cloud/dashboard', '/cloud/drivers', '/cloud/login', '/cloud/operations', '/cloud/rates', '/cloud/settings', '/cloud/shipments', '/cloud/signup', '/cloud/support', '/cloud/team'].some(function (route) { return path === route || path.indexOf(route + '/') === 0; });
              if (privateRoute) return;
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${validMetaPixelId}');
              fbq('track', 'PageView');
            })();
          `}
        </Script>
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="fly-logistics-theme-v2" disableTransitionOnChange>
          <TooltipProvider>
            <a href="#main-content" className="skip-link">Skip to main content</a>
            {children}
            <Toaster richColors closeButton />
          </TooltipProvider>
        </ThemeProvider>
        <JsonLd data={logisticsBusinessJsonLd()} />
        <AnalyticsScripts
          gaMeasurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-3DSNZE15XH"}
          metaPixelId={validMetaPixelId}
          adsenseClient="ca-pub-1037358753872630"
        />
      </body>
    </html>
  );
}
