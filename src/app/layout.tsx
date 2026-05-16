import type { Metadata, Viewport } from "next";
import type * as React from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { siteConfig } from "@/lib/site";

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

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: "Fly Logistics - AI-powered global logistics operating system",
    template: "%s | Fly Logistics"
  },
  description:
    "Fly Logistics is a futuristic AI logistics platform for freight, fleet intelligence, warehousing, live tracking, smart quotes, and global supply-chain orchestration.",
  keywords: [
    "AI logistics",
    "freight platform",
    "fleet management",
    "supply chain",
    "warehouse management",
    "route optimization",
    "shipment tracking"
  ],
  authors: [{ name: "Fly Logistics" }],
  creator: "Fly Logistics",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteConfig.url,
    title: "Fly Logistics",
    description: "AI-powered global logistics operating system.",
    siteName: "Fly Logistics",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Fly Logistics platform" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Fly Logistics",
    description: "AI-powered global logistics operating system.",
    images: ["/opengraph-image"]
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/icons/apple-touch-icon.svg"
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
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Fly Logistics",
    url: siteConfig.url,
    logo: `${siteConfig.url}/logo.svg`,
    sameAs: ["https://www.linkedin.com/company/fly-logistics"],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "enterprise sales",
      email: "enterprise@flylogistics.ai"
    }
  };

  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            {children}
            <Toaster richColors closeButton />
          </TooltipProvider>
        </ThemeProvider>
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
