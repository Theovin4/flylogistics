export const canonicalSiteUrl = "https://flylogistics.com.ng";

export const siteConfig = {
  name: "Fly Logistics",
  url: canonicalSiteUrl,
  description: "Premium logistics for same-day delivery, interstate freight, warehousing, live tracking, and business shipment operations across Nigeria and global lanes.",
  contact: {
    address: "Bolade Oshodi, Mafoluku, Lagos, Nigeria",
    supportEmail: "support@flylogistics.com.ng",
    supportPhone: "+234 706 107 2929",
    whatsappPhone: "+2347061072929",
    hours: "24/7 shipment support for active deliveries"
  },
  guarantees: [
    "Live shipment status from pickup to delivery",
    "Clear ETA guidance before dispatch",
    "Operations review before every confirmed booking",
    "Private delivery verification for completed shipments"
  ],
  policies: [
    { label: "Terms & Conditions", href: "/terms" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Security", href: "/security" },
    { label: "Data Deletion", href: "/data-deletion" },
    { label: "Delivery Policy", href: "/delivery-policy" },
    { label: "Refund Policy", href: "/refund-policy" },
    { label: "Prohibited Items", href: "/prohibited-items" }
  ],
  nav: [
    { label: "Services", href: "/services" },
    { label: "Get Delivery Price", href: "/quote" },
    { label: "Tracking", href: "/tracking" },
    { label: "Live Map", href: "/map" },
    { label: "AI Chat", href: "/chat" },
    { label: "Business", href: "/merchant" },
    { label: "Cloud", href: "/cloud" },
    { label: "Pricing", href: "/pricing" }
  ]
};

export const conversionLinks = [
  { label: "Get Delivery Price", href: "/quote" },
  { label: "Track Shipment", href: "/tracking" },
  { label: "Same-day Delivery", href: "/same-day-delivery" },
  { label: "Lagos Delivery", href: "/lagos-delivery-services" },
  { label: "Business Logistics", href: "/business-logistics" },
  { label: "Warehouse Services", href: "/warehouse-services" },
  { label: "International Shipping", href: "/international-shipping-from-nigeria" },
  { label: "Global Freight", href: "/global-freight-solutions" },
  { label: "International Tracking", href: "/international-tracking" },
  { label: "Logistics Company Software", href: "/cloud" },
  { label: "Security Controls", href: "/security" },
  { label: "Service Areas", href: "/service-areas" },
  { label: "Help Center", href: "/knowledge-base" }
] as const;

export type PublicPageConfig = {
  slug: string;
  title: string;
  eyebrow: string;
  description: string;
  metrics: readonly string[];
  serviceType?: string;
  areaServed?: string;
  faqs?: readonly (readonly [string, string])[];
};

export const publicPages = [
  {
    slug: "security",
    title: "Security, privacy, and operations controls for trusted logistics",
    eyebrow: "Security",
    description:
      "Fly Logistics protects shipment data, customer accounts, payment flows, delivery proof, operational activity, and admin access with practical controls built for enterprise logistics.",
    metrics: ["Verified account access", "Private delivery proof", "Audit-ready operations"],
    serviceType: "Logistics security and privacy controls",
    areaServed: "Global",
    faqs: [
      ["How does Fly Logistics protect customer shipment details?", "Fly Logistics limits public tracking to safe shipment information, keeps sensitive contact details private, and restricts operational data to authorized users."],
      ["Is proof of delivery public?", "No. Proof of delivery can include personal, location, or recipient information, so it stays restricted to authorized operations users."],
      ["Can enterprise teams separate roles?", "Yes. Admin, dispatcher, customer, driver, and business roles are separated so each user sees the correct workspace and actions."],
      ["How are accounts verified?", "New self-service accounts use email confirmation, strong passwords, role checks from the current account profile, short-lived authenticated sessions, and throttled sign-in attempts."],
      ["How are payments handled?", "Payment verification happens through secure server-side flows, signed callbacks where supported, idempotent records, and private credentials that never reach customer pages."],
      ["How should I report a security concern?", "Email support@flylogistics.com.ng without sending passwords, one-time codes, card details, or private keys. The operations team will verify and triage the report."]
    ]
  },
  {
    slug: "about",
    title: "Built for accountable delivery in Nigeria and beyond",
    eyebrow: "About Fly",
    description:
      "Fly Logistics helps people and businesses move critical cargo with faster booking, live shipment visibility, reliable dispatch, and premium customer support across Nigeria and global lanes.",
    metrics: ["Lagos operations desk", "Live shipment visibility", "24/7 active-delivery support"],
    faqs: [
      ["What does Fly Logistics do?", "Fly Logistics combines shipment booking, live tracking, dispatch operations, AI support, and secure delivery confirmation in one logistics workflow."],
      ["Who is Fly Logistics built for?", "The platform supports customers, businesses, dispatchers, drivers, warehouse teams, and admins managing time-sensitive delivery operations."]
    ]
  },
  {
    slug: "services",
    title: "Freight, fleet, warehousing, and intelligence in one network",
    eyebrow: "Services",
    description:
      "Coordinate same-day delivery, interstate freight, business logistics, warehousing, last-mile movement, and time-sensitive cargo through one trusted Fly Logistics network.",
    metrics: ["Same-day delivery", "Interstate freight", "Business logistics"],
    faqs: [
      ["Which logistics services are available?", "Fly Logistics supports same-day delivery, interstate delivery, business logistics, warehouse operations, tracking, driver dispatch, and quote requests."],
      ["Can businesses manage multiple shipments?", "Yes. The platform includes admin operations, quote conversion, shipment creation, driver assignment, tracking timelines, and payment status visibility."]
    ]
  },
  {
    slug: "contact",
    title: "Contact Fly Logistics for delivery support",
    eyebrow: "Contact",
    description:
      "Talk with Fly Logistics specialists for urgent delivery requests, business logistics planning, warehouse support, interstate movement, and enterprise shipping programs.",
    metrics: ["WhatsApp support", "Support email", "Lagos operations office"],
    faqs: [
      ["How can I contact Fly Logistics?", "You can request a quote, track an existing shipment, or contact Fly Logistics on WhatsApp for urgent delivery support."],
      ["Does Fly Logistics support urgent requests?", "Yes. Urgent quote requests can be sent through the booking form or WhatsApp contact flow."]
    ]
  },
  {
    slug: "careers",
    title: "Build reliable logistics operations with Fly Logistics",
    eyebrow: "Careers",
    description:
      "Join operators, customer support specialists, dispatchers, fleet coordinators, and product builders improving delivery reliability for customers and businesses.",
    metrics: ["Operations roles", "Customer support", "Fleet coordination"],
    faqs: [
      ["What teams does Fly Logistics hire for?", "Fly Logistics is designed for operations, engineering, dispatch, customer success, driver support, and product roles."],
      ["Is Fly Logistics focused on AI logistics?", "Yes. The product combines logistics operations with AI-assisted routing, support, dispatch recommendations, and analytics."]
    ]
  },
  {
    slug: "company",
    title: "A logistics company built around trust and visibility",
    eyebrow: "Company",
    description:
      "Fly Logistics coordinates local delivery, interstate movement, international shipping, business logistics, and customer support through one accountable operating network.",
    metrics: ["Nigeria-based operations", "Fly tracking on every shipment", "Local and global delivery support"],
    faqs: [
      ["Where is Fly Logistics based?", "Fly Logistics operates from Bolade Oshodi, Mafoluku, Lagos, Nigeria, with delivery support for Nigerian and international routes."],
      ["What makes Fly Logistics different?", "Customers receive one Fly Logistics experience for booking, payment, tracking, notifications, and support, even when approved fulfilment partners support movement."]
    ]
  },
  {
    slug: "faq",
    title: "Clear answers before, during, and after delivery",
    eyebrow: "Frequently asked questions",
    description:
      "Find straightforward guidance on booking, delivery pricing, payment, shipment tracking, service windows, international shipping, support, and delivery exceptions.",
    metrics: ["Booking guidance", "Tracking help", "Delivery support"],
    faqs: [
      ["How do I create a shipment?", "Create a customer account, enter complete sender and recipient details, review the delivery price, and complete payment. Your Fly tracking number appears after the order is confirmed."],
      ["How do I track my shipment?", "Enter the Fly Logistics tracking number on the public tracking page or open Tracking inside your customer account."],
      ["Can I ship internationally?", "Yes. Fly Logistics supports international import and export requests, subject to customs documentation, destination rules, and route availability."],
      ["Is delivery proof public?", "No. Delivery proof can contain sensitive information and is restricted to authorized operations users."],
      ["How do I contact support?", "Use the official WhatsApp button, email support@flylogistics.com.ng, or call +234 706 107 2929."]
    ]
  },
  {
    slug: "partners",
    title: "Reliable partnerships for wider logistics reach",
    eyebrow: "Partners",
    description:
      "Fly Logistics works with approved transport, fulfilment, warehouse, technology, and business partners while maintaining one consistent customer experience.",
    metrics: ["Controlled fulfilment", "Operational accountability", "Fly-branded tracking"],
    faqs: [
      ["Can a logistics company partner with Fly Logistics?", "Yes. Qualified transport, warehouse, technology, and regional operations providers can contact Fly Logistics for partnership review."],
      ["Will customers have to use a partner tracking system?", "No. Customers continue to use their Fly Logistics tracking number and Fly Logistics support channels."]
    ]
  },
  {
    slug: "press",
    title: "Fly Logistics news and company resources",
    eyebrow: "Press",
    description:
      "Access verified Fly Logistics company information, brand resources, leadership enquiries, service updates, and media contact details.",
    metrics: ["Verified company information", "Media enquiries", "Service announcements"],
    faqs: [
      ["How can journalists contact Fly Logistics?", "Send media enquiries to support@flylogistics.com.ng with the publication, deadline, topic, and contact details."],
      ["Where can I verify a Fly Logistics announcement?", "Official service updates are published on flylogistics.com.ng and Fly Logistics verified communication channels."]
    ]
  },
  {
    slug: "pricing",
    title: "Dynamic delivery pricing for Nigeria and global shipments",
    eyebrow: "Pricing",
    description:
      "Get delivery pricing for local Nigeria delivery, Lagos dispatch, interstate freight, international imports, worldwide exports, urgent movement, ETA, fuel surcharge, and business logistics review.",
    metrics: ["Nigeria delivery rates", "Import and export quotes", "Route and fuel review"],
    faqs: [
      ["How is delivery pricing calculated?", "Fly Logistics estimates shipment rates from delivery type, pickup and destination, country or state, package type, weight, urgency, fuel surcharge, and route availability."],
      ["Can Fly Logistics handle international shipping?", "Yes. Customers can request international import shipments into Nigeria and export shipments from Nigeria to worldwide destinations."],
      ["Can food or snacks go interstate?", "Food/snacks are same-day delivery within the same state only. Standard packages can move next-day within the same state, while interstate freight uses ETA-based pricing."],
      ["Can I request a quote before paying?", "Yes. Customers can submit a quote request first, then proceed to checkout when payment is available."]
    ]
  },
  {
    slug: "enterprise-logistics",
    title: "Enterprise logistics operations for growing teams",
    eyebrow: "Enterprise",
    description:
      "Manage shipment creation, role-based access, driver assignment, customer communication, fulfilment review, payment visibility, and operational audit trails from one protected workspace.",
    metrics: ["Role-based control", "Audit-ready operations", "Shipment governance"],
    serviceType: "Enterprise logistics operations",
    faqs: [
      ["Does Fly Logistics support enterprise workflows?", "Yes. The platform includes protected dashboards, role separation, analytics, shipment management, driver assignment, and quote conversion."],
      ["Can enterprise teams track delivery performance?", "Yes. Admin analytics include shipment status counts, quote trends, payment status, and driver workload."]
    ]
  },
  {
    slug: "warehousing",
    title: "Warehouse coordination connected to delivery",
    eyebrow: "Warehousing",
    description:
      "Coordinate storage requests, inventory movement, dispatch handoffs, business shipment release, and delivery confirmation without separating warehouse work from customer tracking.",
    metrics: ["Storage coordination", "Dispatch handoffs", "Inventory visibility"],
    serviceType: "Warehouse logistics and fulfillment",
    faqs: [
      ["Does Fly Logistics support warehousing?", "Yes. The product includes warehouse service pages and a foundation for warehouse management, dock workflows, and fulfillment coordination."],
      ["Can warehouse operations connect to shipments?", "Yes. Warehouse workflows can be connected to quote requests, shipments, route planning, and delivery confirmation."]
    ]
  },
  {
    slug: "ai-logistics",
    title: "AI assistance for shipment support and dispatch review",
    eyebrow: "AI Logistics",
    description:
      "Use the Fly Logistics AI Assistant to explain tracking updates, summarize shipment context, support dispatch review, and help customers understand the next operational step.",
    metrics: ["Tracking explanations", "Dispatch review", "Quote context"],
    serviceType: "AI logistics automation",
    faqs: [
      ["How does AI help logistics operations?", "AI can answer shipment questions, summarize tracking context, recommend drivers, and support route and quote decisions."],
      ["Does the AI chat use real shipment data?", "The AI chat is connected to shipment lookup foundations so users can ask about tracking IDs and logistics support."]
    ]
  },
  {
    slug: "fleet-management",
    title: "Fleet operations with live driver visibility",
    eyebrow: "Fleet Management",
    description:
      "Monitor driver availability, assigned shipments, live location where enabled, proof of delivery, payout records, and delivery performance from the operations dashboard.",
    metrics: ["Live drivers", "Driver payouts", "Delivery performance"],
    serviceType: "Fleet management software",
    faqs: [
      ["Can Fly Logistics show driver locations?", "Yes. The live map uses driver records, realtime updates, online status, and shipment-to-driver relationships."],
      ["Can drivers update movement?", "Drivers can update location from the driver dashboard or through simulated movement workflows."]
    ]
  },
  {
    slug: "same-day-delivery",
    title: "Same-day delivery built for urgent business movement",
    eyebrow: "Same-day delivery",
    description:
      "Book urgent pickups, assign available drivers, track movement live, and keep customers updated from request to delivery completion.",
    metrics: ["Urgent dispatch review", "ETA guidance", "Delivery confirmation"],
    serviceType: "Same-day delivery service",
    areaServed: "Lagos and major Nigerian cities",
    faqs: [
      ["How fast can same-day delivery be booked?", "Customers can submit a booking request in minutes. Operations can review urgency, assign a driver, and issue a tracking ID."],
      ["Can I track same-day deliveries live?", "Yes. Public tracking shows shipment status, timeline, assigned driver, and ETA."]
    ]
  },
  {
    slug: "interstate-delivery",
    title: "Interstate delivery with live visibility and clear status updates",
    eyebrow: "Interstate delivery",
    description:
      "Coordinate state-to-state deliveries with quote intake, route planning, driver assignment, payment status, and customer tracking.",
    metrics: ["State-to-state lanes", "Delivery assignment", "Timeline events"],
    serviceType: "Interstate delivery service",
    areaServed: "Nigeria",
    faqs: [
      ["Does Fly Logistics handle interstate delivery?", "Yes. The platform supports quote requests, shipment creation, driver assignment, and tracking for state-to-state movement."],
      ["How do customers receive interstate updates?", "Customers can track by tracking ID and receive WhatsApp delivery updates from admin operations."]
    ]
  },
  {
    slug: "business-logistics",
    title: "Business logistics software for teams that ship every day",
    eyebrow: "Business logistics",
    description:
      "Give your team a logistics command center for bookings, payments, dispatch, tracking, analytics, driver workloads, and customer communication.",
    metrics: ["Repeat shipment workflows", "Payment visibility", "Operations analytics"],
    serviceType: "Business logistics platform",
    areaServed: "Global",
    faqs: [
      ["Can businesses manage quotes and shipments?", "Yes. Admins can view quote requests, convert them into shipments, assign drivers, update statuses, and add timeline events."],
      ["Does Fly Logistics support payment status?", "Yes. Payment progress can be shown to customers and operations teams so every booking is easier to manage."]
    ]
  },
  {
    slug: "warehouse-services",
    title: "Warehouse services connected to delivery operations",
    eyebrow: "Warehouse services",
    description:
      "Connect storage, fulfillment planning, dispatch coordination, delivery tracking, and delivery confirmation into one premium logistics workflow.",
    metrics: ["Storage workflows", "Fulfillment planning", "Delivery handoff"],
    serviceType: "Warehouse services",
    areaServed: "Nigeria",
    faqs: [
      ["Can warehouse services connect to delivery?", "Yes. Warehouse service flows can connect inventory movement to shipment booking, dispatch assignment, and public tracking."],
      ["Is this separate from warehousing?", "Warehouse services focuses on customer-facing storage and fulfillment offers, while warehousing covers the operational intelligence layer."]
    ]
  },
  {
    slug: "ai-powered-logistics",
    title: "AI-assisted logistics for faster dispatch review",
    eyebrow: "AI-powered logistics",
    description:
      "Use shipment-aware chat, dispatch recommendations, route context, shipment lookup, and analytics to help operations respond faster.",
    metrics: ["Dispatch suggestions", "Shipment-aware chat", "Route context"],
    serviceType: "AI-powered logistics platform",
    areaServed: "Global",
    faqs: [
      ["What makes Fly Logistics AI-powered?", "Fly Logistics includes AI chat support, shipment context, dispatch recommendations, route intelligence, and operational analytics."],
      ["Does AI automatically assign drivers?", "AI recommends the best driver, but admins approve assignments before saving changes."]
    ]
  },
  {
    slug: "lagos-delivery-services",
    title: "Lagos delivery services with live tracking and WhatsApp updates",
    eyebrow: "Lagos delivery services",
    description:
      "Move packages across Lagos with instant booking requests, driver visibility, delivery timelines, WhatsApp contact, and delivery confirmation.",
    metrics: ["Lagos driver map", "Customer WhatsApp updates", "Delivery confirmation"],
    serviceType: "Lagos delivery service",
    areaServed: "Lagos, Nigeria",
    faqs: [
      ["Does Fly Logistics support Lagos delivery?", "Yes. The live map is centered on Lagos operations and supports driver markers, assigned shipments, and realtime updates."],
      ["Can Lagos customers contact operations quickly?", "Yes. Quote, tracking, and landing pages include WhatsApp contact actions for urgent delivery requests."]
    ]
  },
  {
    slug: "abuja-logistics",
    title: "Abuja logistics for business deliveries and interstate freight",
    eyebrow: "Abuja logistics",
    description:
      "Book Abuja deliveries, FCT business logistics, interstate freight, secure pickup coordination, ETA guidance, and shipment tracking through Fly Logistics.",
    metrics: ["FCT delivery support", "Interstate freight lanes", "Business shipment tracking"],
    serviceType: "Abuja logistics service",
    areaServed: "Abuja, Nigeria",
    faqs: [
      ["Does Fly Logistics support Abuja logistics?", "Yes. Fly Logistics supports Abuja delivery requests, FCT business logistics, interstate movement, and tracking for active shipments."],
      ["Can Abuja shipments move to other states?", "Yes. Interstate shipments are priced by route, urgency, package details, fuel surcharge, and network availability."]
    ]
  },
  {
    slug: "ogun-courier-service",
    title: "Ogun courier service for local and business deliveries",
    eyebrow: "Ogun courier service",
    description:
      "Move packages across Ogun State and nearby Lagos corridors with delivery pricing, pickup coordination, business logistics, and trackable shipment timelines.",
    metrics: ["Ogun delivery support", "Lagos-Ogun corridors", "Trackable courier movement"],
    serviceType: "Ogun courier service",
    areaServed: "Ogun, Nigeria",
    faqs: [
      ["Does Fly Logistics serve Ogun State?", "Yes. Customers and businesses can request Ogun courier service, Lagos-Ogun movement, and interstate delivery support."],
      ["Can Ogun deliveries be tracked?", "Yes. Every confirmed shipment can receive a Fly Logistics tracking ID and timeline updates."]
    ]
  },
  {
    slug: "port-harcourt-logistics",
    title: "Port Harcourt logistics for freight, delivery, and business cargo",
    eyebrow: "Port Harcourt logistics",
    description:
      "Coordinate Rivers State deliveries, Port Harcourt freight, business cargo movement, interstate shipping, tracking, and premium logistics support.",
    metrics: ["Rivers State logistics", "Business cargo movement", "Interstate delivery"],
    serviceType: "Port Harcourt logistics service",
    areaServed: "Port Harcourt, Nigeria",
    faqs: [
      ["Does Fly Logistics support Port Harcourt?", "Yes. Fly Logistics supports Port Harcourt logistics requests, Rivers State deliveries, and interstate freight coordination."],
      ["Can businesses ship from Port Harcourt?", "Yes. Business accounts can manage shipment requests, payment visibility, tracking, and delivery history."]
    ]
  },
  {
    slug: "nigeria-to-ghana-shipping",
    title: "Nigeria to Ghana shipping with international logistics support",
    eyebrow: "Nigeria to Ghana shipping",
    description:
      "Request Nigeria to Ghana shipping for documents, packages, e-commerce orders, and business cargo with customs-aware review and Fly Logistics tracking.",
    metrics: ["West Africa shipping", "Export documentation review", "Trackable international movement"],
    serviceType: "Nigeria to Ghana shipping",
    areaServed: "Nigeria and Ghana",
    faqs: [
      ["Can Fly Logistics ship from Nigeria to Ghana?", "Yes. Customers can request international export shipping from Nigeria to Ghana, subject to documentation, customs, and route availability."],
      ["What details are needed for Ghana shipping?", "Origin and destination countries, pickup and delivery details, package value, customs information, weight, and documentation notes help operations review the shipment."]
    ]
  },
  {
    slug: "nigeria-to-kenya-shipping",
    title: "Nigeria to Kenya shipping for packages and business cargo",
    eyebrow: "Nigeria to Kenya shipping",
    description:
      "Plan Nigeria to Kenya shipping with export review, international delivery pricing, customs context, route visibility, and Fly Logistics customer support.",
    metrics: ["Africa export lanes", "Customs-aware review", "International tracking"],
    serviceType: "Nigeria to Kenya shipping",
    areaServed: "Nigeria and Kenya",
    faqs: [
      ["Does Fly Logistics support Nigeria to Kenya shipping?", "Yes. Fly Logistics can review international export requests from Nigeria to Kenya through available fulfilment partners."],
      ["Will customers receive a tracking ID?", "Yes. Confirmed shipments remain trackable with Fly Logistics tracking details, even when a fulfilment partner handles movement."]
    ]
  },
  {
    slug: "nigeria-to-south-africa-shipping",
    title: "Nigeria to South Africa shipping and export logistics",
    eyebrow: "Nigeria to South Africa shipping",
    description:
      "Ship from Nigeria to South Africa with international quote review, customs documentation, business cargo coordination, and trackable Fly Logistics updates.",
    metrics: ["South Africa export support", "Business cargo review", "Fly tracking visibility"],
    serviceType: "Nigeria to South Africa shipping",
    areaServed: "Nigeria and South Africa",
    faqs: [
      ["Can I ship from Nigeria to South Africa?", "Yes. Fly Logistics supports international export request intake for South Africa, subject to customs, duties, taxes, and route availability."],
      ["Are duties and taxes included immediately?", "Duties and taxes may require operations review. Customers can submit estimates and documentation during booking."]
    ]
  },
  {
    slug: "international-shipping-from-nigeria",
    title: "International shipping from Nigeria to worldwide destinations",
    eyebrow: "International shipping from Nigeria",
    description:
      "Export packages, documents, e-commerce orders, and business cargo from Nigeria to global destinations with customs-aware review and Fly Logistics tracking.",
    metrics: ["Worldwide exports", "Customs documentation", "Global tracking support"],
    serviceType: "International shipping from Nigeria",
    areaServed: "Global",
    faqs: [
      ["Can Fly Logistics ship internationally from Nigeria?", "Yes. Customers can request international export delivery from Nigeria to worldwide destinations through Fly Logistics."],
      ["What documents are needed for international shipping?", "Common requirements include package value, customs information, commercial invoice details, recipient details, and import/export documentation notes."]
    ]
  },
  {
    slug: "global-freight-solutions",
    title: "Global freight solutions for growing businesses",
    eyebrow: "Global freight solutions",
    description:
      "Coordinate local, interstate, air freight, ocean freight, international import, international export, and fulfilment workflows under the Fly Logistics brand.",
    metrics: ["Global lanes", "Flexible fulfilment architecture", "Business logistics dashboard"],
    serviceType: "Global freight solutions",
    areaServed: "Global",
    faqs: [
      ["What are global freight solutions?", "Global freight solutions combine international import, export, air freight, ocean freight, fulfilment coordination, tracking, and business shipment operations."],
      ["Will tracking remain with Fly Logistics?", "Yes. Customers continue to track every supported shipment through Fly Logistics."]
    ]
  },
  {
    slug: "air-freight-services",
    title: "Air freight services for urgent international cargo",
    eyebrow: "Air freight services",
    description:
      "Request air freight for urgent international packages, documents, business cargo, import/export movement, customs review, and global delivery support.",
    metrics: ["Urgent cargo", "Import/export review", "Worldwide coordination"],
    serviceType: "Air freight services",
    areaServed: "Global",
    faqs: [
      ["When should I use air freight?", "Air freight is best for urgent documents, high-priority packages, business cargo, and time-sensitive international shipments."],
      ["Does air freight include customs review?", "Yes. Fly Logistics collects customs information, package value, and documentation notes during booking for operations review."]
    ]
  },
  {
    slug: "ocean-freight-services",
    title: "Ocean freight services for larger international shipments",
    eyebrow: "Ocean freight services",
    description:
      "Plan ocean freight for larger international cargo, import/export documentation, business freight, slower bulk movement, and cost-conscious global logistics.",
    metrics: ["Bulk international cargo", "Import/export documentation", "Business freight planning"],
    serviceType: "Ocean freight services",
    areaServed: "Global",
    faqs: [
      ["When is ocean freight useful?", "Ocean freight is useful for larger, less urgent international shipments where cost control matters more than speed."],
      ["Can Fly Logistics prepare ocean freight quotes?", "Yes. Customers can submit international details and documentation notes for operations review."]
    ]
  },
  {
    slug: "ecommerce-fulfillment-worldwide",
    title: "E-commerce fulfillment worldwide for modern brands",
    eyebrow: "E-commerce fulfillment worldwide",
    description:
      "Support e-commerce delivery, saved addresses, shipment tracking, wallet payments, business accounts, local dispatch, interstate delivery, and worldwide fulfilment workflows.",
    metrics: ["E-commerce logistics", "Wallet payments", "Worldwide fulfilment"],
    serviceType: "E-commerce fulfillment worldwide",
    areaServed: "Global",
    faqs: [
      ["Can e-commerce brands use Fly Logistics?", "Yes. Fly Logistics supports customer accounts, merchant workflows, wallet payments, shipment tracking, and repeat delivery operations."],
      ["Can stores ship locally and internationally?", "Yes. Businesses can use local Nigeria delivery, interstate movement, international import, and international export workflows."]
    ]
  }
] as const satisfies readonly PublicPageConfig[];

export function getPublicPage(slug: string) {
  const page = publicPages.find((item) => item.slug === slug);
  if (!page) throw new Error(`Unknown public page: ${slug}`);
  return page;
}
