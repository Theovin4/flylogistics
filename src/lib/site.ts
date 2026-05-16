export const siteConfig = {
  name: "Fly Logistics",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  description: "AI-powered global logistics operating system.",
  nav: [
    { label: "Dashboard", href: "/dashboard/admin" },
    { label: "Live Map", href: "/map" },
    { label: "AI Chat", href: "/chat" },
    { label: "Services", href: "/services" },
    { label: "Tracking", href: "/tracking" },
    { label: "Pricing", href: "/pricing" }
  ]
};

export const publicPages = [
  {
    slug: "about",
    title: "Built for a faster physical internet",
    eyebrow: "About Fly",
    description:
      "Fly Logistics unifies freight procurement, multimodal visibility, autonomous dispatch, and warehouse intelligence for teams moving critical cargo across continents.",
    metrics: ["42 countries connected", "99.97% tracking uptime", "18% average cost reduction"]
  },
  {
    slug: "services",
    title: "Freight, fleet, warehousing, and intelligence in one network",
    eyebrow: "Services",
    description:
      "Coordinate air, ocean, ground, last-mile, and cold-chain operations through one AI-commanded platform with operational teams and API access.",
    metrics: ["Air and ocean", "FTL/LTL", "White-glove delivery"]
  },
  {
    slug: "contact",
    title: "Move your network into intelligent motion",
    eyebrow: "Contact",
    description:
      "Talk with logistics architects for enterprise onboarding, API access, warehouse design, and regional deployment planning.",
    metrics: ["24/7 command center", "Enterprise SLAs", "Global onboarding"]
  },
  {
    slug: "careers",
    title: "Build the logistics operating layer for the AI era",
    eyebrow: "Careers",
    description:
      "Join operators, engineers, designers, and fleet specialists building resilient logistics infrastructure for high-growth companies.",
    metrics: ["Remote-first roles", "Ops and product", "Equity packages"]
  },
  {
    slug: "pricing",
    title: "Usage-based logistics infrastructure pricing",
    eyebrow: "Pricing",
    description:
      "Start with shipment visibility and smart quotes, then scale into enterprise orchestration, managed freight, and private network intelligence.",
    metrics: ["Starter", "Growth", "Enterprise"]
  },
  {
    slug: "enterprise-logistics",
    title: "Enterprise-grade logistics control tower",
    eyebrow: "Enterprise",
    description:
      "Deploy AI-assisted dispatch, carrier governance, compliance, and predictive risk monitoring across regions, business units, and partner networks.",
    metrics: ["RBAC", "Audit trails", "Dedicated success"]
  },
  {
    slug: "warehousing",
    title: "Warehouse intelligence that moves with demand",
    eyebrow: "Warehousing",
    description:
      "Plan inventory, dock scheduling, labor waves, yard movements, and fulfillment SLAs using predictive analytics and connected warehouse signals.",
    metrics: ["Slotting AI", "Dock scheduling", "Inventory visibility"]
  },
  {
    slug: "ai-logistics",
    title: "AI copilots for every logistics decision",
    eyebrow: "AI Logistics",
    description:
      "Use OpenAI-powered assistants to explain shipment risk, recommend reroutes, summarize support threads, and forecast delivery confidence.",
    metrics: ["AI routing", "Risk summaries", "Quote intelligence"]
  },
  {
    slug: "fleet-management",
    title: "Fleet operations with live intelligence",
    eyebrow: "Fleet Management",
    description:
      "Monitor vehicles, driver availability, maintenance windows, utilization, fuel burn, proof of delivery, and route performance in real time.",
    metrics: ["Live vehicles", "Driver earnings", "Maintenance signals"]
  }
] as const;
