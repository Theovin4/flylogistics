const baseUrl = (process.argv[2] || process.env.NEXT_PUBLIC_APP_URL || "https://flylogistics.com.ng").replace(/\/+$/, "");

async function statusOf(pathOrUrl) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${baseUrl}${pathOrUrl}`;
  try {
    const response = await fetch(url, {
      redirect: "manual",
      headers: {
        "User-Agent": "FlyLogisticsSEOAudit/1.0 (+https://flylogistics.com.ng)"
      }
    });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      url
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      error: error instanceof Error ? error.message : "Request failed"
    };
  }
}

function extractSitemapUrls(xml) {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1].trim());
}

async function main() {
  const [home, robots, health, sitemapResponse] = await Promise.all([
    statusOf("/"),
    statusOf("/robots.txt"),
    statusOf("/api/health"),
    fetch(`${baseUrl}/sitemap.xml`, {
      headers: {
        "User-Agent": "FlyLogisticsSEOAudit/1.0 (+https://flylogistics.com.ng)"
      }
    }).catch((error) => error)
  ]);

  const sitemapStatus = sitemapResponse instanceof Response ? sitemapResponse.status : 0;
  const sitemapXml = sitemapResponse instanceof Response ? await sitemapResponse.text() : "";
  const sitemapUrls = extractSitemapUrls(sitemapXml);
  const validXml = sitemapXml.includes("<urlset") && sitemapUrls.length > 0;
  const checks = await Promise.all(sitemapUrls.map((url) => statusOf(url)));
  const broken = checks.filter((check) => !check.ok);

  const report = {
    baseUrl,
    checkedAt: new Date().toISOString(),
    homepage: home,
    robots: robots,
    health: health,
    sitemap: {
      url: `${baseUrl}/sitemap.xml`,
      status: sitemapStatus,
      validXml,
      urlCount: sitemapUrls.length
    },
    sitemapUrls: checks,
    brokenUrls: broken
  };

  console.log(JSON.stringify(report, null, 2));
  if (!home.ok || !robots.ok || !health.ok || sitemapStatus !== 200 || !validXml || broken.length) {
    process.exitCode = 1;
  }
}

await main();
