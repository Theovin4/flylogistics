"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

type AnalyticsScriptsProps = {
  gaMeasurementId?: string;
  metaPixelId?: string;
  adsenseClient?: string;
};

const privateRoutePrefixes = [
  "/admin",
  "/auth",
  "/customer",
  "/dashboard",
  "/dispatcher",
  "/driver",
  "/fly-admin-ops",
  "/login",
  "/register",
  "/rider"
] as const;

const privateCloudRoutes = [
  "/cloud/analytics",
  "/cloud/billing",
  "/cloud/customers",
  "/cloud/dashboard",
  "/cloud/drivers",
  "/cloud/login",
  "/cloud/settings",
  "/cloud/shipments",
  "/cloud/signup"
] as const;

function isPrivateRoute(pathname: string) {
  if (privateRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return true;
  if (pathname === "/merchant/dashboard" || pathname.startsWith("/merchant/dashboard/")) return true;
  return privateCloudRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function AnalyticsScripts({ gaMeasurementId, metaPixelId, adsenseClient }: AnalyticsScriptsProps) {
  const pathname = usePathname();
  const shouldLoadMarketing = !isPrivateRoute(pathname);
  const normalizedGaMeasurementId =
    gaMeasurementId && /^G-[A-Z0-9]+$/i.test(gaMeasurementId.trim()) ? gaMeasurementId.trim().toUpperCase() : undefined;
  const normalizedMetaPixelId = metaPixelId && /^\d{8,20}$/.test(metaPixelId.trim()) ? metaPixelId.trim() : undefined;
  const lastTrackedPath = useRef<string | null>(null);
  const lastMetaTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!shouldLoadMarketing || !normalizedGaMeasurementId) return;

    const pagePath = `${pathname}${window.location.search}`;

    // The initial page view is emitted by gtag('config'). Only emit explicit
    // page views after Next.js client-side navigation.
    if (lastTrackedPath.current === null) {
      lastTrackedPath.current = pagePath;
      return;
    }

    if (lastTrackedPath.current === pagePath) return;
    lastTrackedPath.current = pagePath;

    let attempts = 0;
    let retryTimer: number | undefined;

    const sendPageView = () => {
      if (window.gtag) {
        window.gtag("event", "page_view", {
          page_path: pagePath,
          page_location: window.location.href,
          page_title: document.title
        });
        return;
      }

      attempts += 1;
      if (attempts < 10) {
        retryTimer = window.setTimeout(sendPageView, 250);
      }
    };

    sendPageView();

    return () => {
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [normalizedGaMeasurementId, pathname, shouldLoadMarketing]);

  useEffect(() => {
    if (!shouldLoadMarketing || !normalizedMetaPixelId) return;
    const pagePath = `${pathname}${window.location.search}`;
    if (lastMetaTrackedPath.current === null) {
      lastMetaTrackedPath.current = pagePath;
      return;
    }
    if (lastMetaTrackedPath.current === pagePath) return;
    lastMetaTrackedPath.current = pagePath;

    let attempts = 0;
    let retryTimer: number | undefined;
    const sendMetaPageView = () => {
      if (window.fbq) {
        window.fbq("track", "PageView", {}, { eventID: `pageview-${crypto.randomUUID()}` });
        return;
      }
      attempts += 1;
      if (attempts < 10) retryTimer = window.setTimeout(sendMetaPageView, 250);
    };
    sendMetaPageView();

    return () => {
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [normalizedMetaPixelId, pathname, shouldLoadMarketing]);

  useEffect(() => {
    if (!shouldLoadMarketing || !adsenseClient || document.getElementById("google-adsense")) return;

    const script = document.createElement("script");
    script.id = "google-adsense";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adsenseClient)}`;
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [adsenseClient, shouldLoadMarketing]);

  if (!shouldLoadMarketing) return null;

  return (
    <>
      {normalizedGaMeasurementId && (
        <>
          <Script
            id="fly-google-analytics-loader"
            src={`https://www.googletagmanager.com/gtag/js?id=${normalizedGaMeasurementId}`}
            strategy="afterInteractive"
          />
          <Script id="fly-google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${normalizedGaMeasurementId}', { send_page_view: true });
            `}
          </Script>
        </>
      )}
    </>
  );
}
