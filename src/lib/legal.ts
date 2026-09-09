export type LegalPage = {
  slug: string;
  title: string;
  description: string;
  updatedAt: string;
  sections: {
    title: string;
    body: string[];
  }[];
};

export const legalPages = {
  terms: {
    slug: "terms",
    title: "Terms & Conditions",
    description: "The customer terms for using Fly Logistics booking, tracking, delivery, payment, and support services.",
    updatedAt: "August 29, 2026",
    sections: [
      {
        title: "Service scope",
        body: [
          "Fly Logistics provides booking, dispatch coordination, shipment tracking, customer support, delivery communication, and related logistics services.",
          "Every booking is subject to route availability, vehicle availability, item eligibility, payment status, and operational review."
        ]
      },
      {
        title: "Customer responsibilities",
        body: [
          "Customers must provide accurate pickup details, delivery details, recipient contacts, package descriptions, weight, urgency, and handling notes.",
          "Customers are responsible for lawful packaging and must not submit prohibited, unsafe, restricted, or falsely declared items."
        ]
      },
      {
        title: "Pricing and payment",
        body: [
          "Estimated prices may change after operations review if package size, waiting time, route risk, access restrictions, fuel conditions, or service requirements differ from the submitted details.",
          "A shipment may remain pending until payment is confirmed or an approved business billing arrangement is in place."
        ]
      },
      {
        title: "Tracking and communication",
        body: [
          "Tracking updates are provided for customer convenience and may change as drivers, dispatchers, and operations teams update the shipment record.",
          "Fly Logistics may contact customers by phone, email, WhatsApp, or in-app notifications for quote, payment, pickup, delivery, and support updates."
        ]
      },
      {
        title: "International shipments and customs",
        body: [
          "International bookings are subject to export, import, customs, sanctions, aviation, maritime, postal, and destination-country rules. The sender must provide a truthful description, value, weight, origin, intended use, and any documents requested by authorities.",
          "Duties, taxes, inspection charges, storage, clearance, return, disposal, and destination fees are payable by the party identified during booking unless Fly Logistics confirms otherwise in writing. Customs decisions and clearance times are outside our direct control."
        ]
      },
      {
        title: "Loss, damage, delays, and claims",
        body: [
          "Customers must package items for the chosen transport method and report visible loss or damage promptly with the tracking number, photographs, value evidence, and other relevant records. Claims are assessed against the accepted service, declared value, packaging, exclusions, and applicable law.",
          "Estimated delivery dates are not guarantees unless a written service commitment expressly says so. Fly Logistics is not responsible for indirect or consequential loss to the extent permitted by law, and nothing in these terms removes rights that cannot lawfully be excluded."
        ]
      },
      {
        title: "Suspension, cancellation, and acceptable use",
        body: [
          "We may pause, refuse, inspect, return, or cancel a booking where details are inaccurate, payment is unresolved, an item is unsafe or restricted, fraud is suspected, verification fails, or continuing the service would breach law or create a safety risk.",
          "Users must not misuse accounts, tracking, wallets, support, promotions, or platform access. Unauthorized access, impersonation, abusive conduct, payment manipulation, and interference with operations may lead to account restriction and lawful reporting."
        ]
      },
      {
        title: "Complaints, governing law, and contact",
        body: [
          "Raise a complaint through support@flylogistics.com.ng with the relevant tracking or payment reference. We will acknowledge the complaint, investigate available records, and communicate the outcome or next step through a verified contact channel.",
          "These terms are governed by applicable Nigerian law. Where a dispute is not resolved through support, the parties may use any consumer-protection, regulatory, mediation, arbitration, or court process available under applicable law."
        ]
      }
    ]
  },
  privacy: {
    slug: "privacy",
    title: "Privacy Policy",
    description: "How Fly Logistics handles customer, driver, shipment, payment, tracking, and support information.",
    updatedAt: "August 29, 2026",
    sections: [
      {
        title: "Information we collect",
        body: [
          "We collect information needed to provide logistics services, including names, phone numbers, email addresses, pickup and delivery addresses, package details, payment references, tracking activity, support requests, and delivery confirmations.",
          "Driver and rider accounts may include identity, vehicle, location, availability, and proof-of-delivery information needed for safe operations."
        ]
      },
      {
        title: "How information is used",
        body: [
          "Information is used to quote, book, dispatch, track, support, bill, verify, and improve Fly Logistics services.",
          "Delivery proof media is used for operations verification and is not shown publicly on tracking pages."
        ]
      },
      {
        title: "Sharing and security",
        body: [
          "We only share operational details with people who need them to complete or support a shipment, such as assigned drivers, dispatchers, customer support, and payment processors.",
          "Fly Logistics uses access controls, secure server-side processes, and private operational workflows to protect sensitive information."
        ]
      },
      {
        title: "Advertising and cookies",
        body: [
          "Fly Logistics may work with advertising partners, including Google, to show ads and measure advertising performance on public website pages.",
          "Advertising partners may use cookies or similar technologies to help serve ads based on visits to Fly Logistics and other websites.",
          "Visitors can manage personalized advertising preferences through Google Ads Settings or other advertising industry opt-out tools where available.",
          "We do not place advertising scripts inside private operational screens such as customer account data, admin tools, driver dashboards, payment records, or support conversations."
        ]
      },
      {
        title: "Customer choices",
        body: [
          "Customers can contact support to request account help, shipment corrections, communication preferences, or privacy-related assistance.",
          "Some information may be retained where required for legal, safety, billing, dispute, or audit purposes."
        ]
      },
      {
        title: "Legal basis and data rights",
        body: [
          "Depending on the activity and applicable law, we process information to perform a service contract, comply with legal obligations, protect legitimate operational and security interests, or act on valid consent.",
          "Eligible users may request access, correction, deletion, restriction, objection, portability, or withdrawal of consent. Requests are verified before action, and some rights may be limited by lawful retention, fraud prevention, safety, accounting, or dispute obligations."
        ]
      },
      {
        title: "International transfers and service providers",
        body: [
          "Worldwide delivery and communications may require information to be processed in another country by vetted payment, messaging, hosting, mapping, storage, identity, or fulfilment services. We limit information to what is reasonably needed and apply contractual, technical, and organizational safeguards appropriate to the transfer.",
          "We do not sell private shipment records. Public tracking is limited to customer-safe delivery information and does not display private proof media or personal phone numbers."
        ]
      },
      {
        title: "Retention, security, and incidents",
        body: [
          "We retain information only for as long as reasonably needed for service delivery, account management, tax, accounting, claims, fraud prevention, safety, audits, backups, and legal obligations. Retention periods vary by record type and jurisdiction.",
          "Safeguards include role-based access, server-side secret handling, encryption in transit, rate limits, audit records, payment verification, and restricted operational access. No online system is risk-free; confirmed incidents are assessed and handled under applicable notification duties."
        ]
      },
      {
        title: "Children and privacy contact",
        body: [
          "Fly Logistics services are not directed to children who cannot lawfully enter a service contract. A parent, guardian, or authorized adult must manage any shipment involving a minor's information.",
          "Send privacy questions or rights requests to support@flylogistics.com.ng. Include enough information to identify the relevant account or shipment, but never send a password, one-time code, full card number, or private key."
        ]
      }
    ]
  },
  deletion: {
    slug: "data-deletion",
    title: "User Data Deletion Instructions",
    description: "How Fly Logistics users can request deletion of their account and personal information.",
    updatedAt: "June 20, 2026",
    sections: [
      {
        title: "How to request deletion",
        body: [
          "Send an email to support@flylogistics.com.ng with the subject Data Deletion Request. Include the name, email address, and phone number connected to your Fly Logistics account so our support team can verify the request.",
          "You may also contact Fly Logistics support through the official contact page and clearly state that you want your account and personal information deleted. Do not send passwords, payment card details, or one-time passwords."
        ]
      },
      {
        title: "Verification and processing",
        body: [
          "Fly Logistics may ask for reasonable verification before deleting account information to prevent unauthorized requests.",
          "After verification, eligible account information will be deleted or anonymized. We will confirm completion through the verified email address or phone number associated with the account."
        ]
      },
      {
        title: "Information we may retain",
        body: [
          "Some shipment, payment, fraud-prevention, dispute, safety, tax, audit, or legal records may be retained where required by law or legitimate operational obligations.",
          "Any retained information remains protected and is used only for the applicable legal, safety, accounting, or dispute-resolution purpose."
        ]
      }
    ]
  },
  delivery: {
    slug: "delivery-policy",
    title: "Delivery Policy",
    description: "Fly Logistics delivery standards for bookings, same-day movement, interstate delivery, tracking, and delivery completion.",
    updatedAt: "August 29, 2026",
    sections: [
      {
        title: "Booking review",
        body: [
          "Every booking is reviewed for route fit, package type, weight, urgency, driver availability, vehicle fit, and payment readiness.",
          "Food and snacks are accepted for same-day delivery within the same state only. Standard packages are usually next-day within the same state. Interstate shipments use ETA-based delivery guidance."
        ]
      },
      {
        title: "Pickup and delivery",
        body: [
          "Customers must make packages ready at the agreed pickup point and ensure a reachable recipient is available at delivery.",
          "Delays may occur because of traffic, weather, access restrictions, incorrect details, recipient unavailability, safety checks, or force majeure events."
        ]
      },
      {
        title: "Tracking and proof",
        body: [
          "Public tracking shows shipment status, route details, ETA, timeline, and assigned driver information where available.",
          "Proof-of-delivery images, signatures, OTP records, and geolocation proof are private operational records and are visible to authorized operations users only."
        ]
      },
      {
        title: "Failed delivery",
        body: [
          "A delivery may be marked failed if the recipient is unavailable, the address is inaccessible, the item is rejected, payment requirements are not met, or safety concerns prevent completion.",
          "Redelivery, return, storage, waiting time, or extra route charges may apply."
        ]
      },
      {
        title: "International delivery",
        body: [
          "International import and export delivery is subject to route availability, accurate declarations, security screening, customs clearance, destination rules, and any required permits or supporting documents.",
          "Quoted transit time normally excludes customs holds, regulatory inspections, duties or tax collection, recipient clearance delays, force majeure, and restricted destination access unless expressly stated otherwise."
        ]
      },
      {
        title: "Address changes and handover",
        body: [
          "Address, contact, or delivery-instruction changes must be requested through an authenticated account or verified support channel. A change may require identity checks, repricing, a revised ETA, or operations approval.",
          "Delivery is completed only after the applicable status update and authorized operational verification. Private signatures, photos, one-time codes, and location records are not published to customers or guests."
        ]
      }
    ]
  },
  refund: {
    slug: "refund-policy",
    title: "Refund Policy",
    description: "How Fly Logistics reviews refunds, cancellations, failed deliveries, payment disputes, and service adjustments.",
    updatedAt: "August 29, 2026",
    sections: [
      {
        title: "Refund eligibility",
        body: [
          "Refunds are reviewed case by case based on payment status, shipment status, cancellation timing, driver assignment, pickup completion, delivery attempt, and service evidence.",
          "A full or partial refund may be considered where Fly Logistics cannot provide the paid service and no substantial operational cost has been incurred."
        ]
      },
      {
        title: "Non-refundable situations",
        body: [
          "Fees may be non-refundable after driver dispatch, pickup, failed delivery caused by incorrect details, recipient unavailability, prohibited item discovery, or customer cancellation after operations work has started.",
          "Payment processor charges, waiting fees, return fees, storage fees, and route adjustment fees may be deducted where applicable."
        ]
      },
      {
        title: "Disputes",
        body: [
          "Customers should contact support with the quote reference, tracking ID, payment reference, and a clear explanation of the dispute.",
          "Fly Logistics reviews shipment timeline, driver updates, delivery proof, communication logs, and payment records before making a decision."
        ]
      },
      {
        title: "Processing method and timing",
        body: [
          "Approved refunds are returned to the original payment method or the verified Fly Logistics wallet unless another lawful method is agreed. Bank, card, mobile-money, and blockchain processing times are controlled by the relevant payment network after release.",
          "Automatic cancellation refunds, where offered, remain subject to duplicate-payment checks, fraud review, completed-service checks, and account verification. A pending refund is not completed until the ledger and payment record show a successful credit."
        ]
      },
      {
        title: "Chargebacks and crypto payments",
        body: [
          "Customers should contact support before filing a chargeback so that shipment and payment records can be reviewed. Fraudulent or duplicate recovery attempts may result in account restriction and recovery action permitted by law.",
          "Crypto transfers are irreversible and require manual or automated confirmation against the correct network, address, amount, and transaction record. Sending an unsupported asset or using the wrong network may prevent recovery and does not by itself confirm payment."
        ]
      }
    ]
  },
  prohibited: {
    slug: "prohibited-items",
    title: "Prohibited Items Policy",
    description: "Items that Fly Logistics does not accept for pickup, delivery, warehousing, or freight movement.",
    updatedAt: "August 29, 2026",
    sections: [
      {
        title: "Items we do not carry",
        body: [
          "Fly Logistics does not accept illegal goods, firearms, ammunition, explosives, hazardous chemicals, illicit drugs, counterfeit goods, stolen property, human remains, live animals without written approval, or items prohibited by law.",
          "We may also reject cash, high-value jewelry, fragile antiques, temperature-sensitive goods, confidential documents, or regulated items without prior written approval and proper handling arrangements."
        ]
      },
      {
        title: "Customer declaration",
        body: [
          "Customers must accurately declare package contents, weight, fragility, value, and handling requirements before pickup.",
          "Fly Logistics may refuse, cancel, return, hold, or report any shipment that appears unsafe, unlawful, undeclared, misdeclared, or restricted."
        ]
      },
      {
        title: "Responsibility and safety",
        body: [
          "Customers remain responsible for losses, penalties, claims, delays, or damages caused by prohibited, restricted, unsafe, or falsely declared items.",
          "Operations teams and drivers may request additional information before accepting sensitive or high-risk items."
        ]
      },
      {
        title: "International restrictions",
        body: [
          "International shipments must also comply with origin, transit, and destination-country controls, including customs classification, sanctions, export controls, aviation or maritime security, and rules for dangerous goods.",
          "Restricted goods may require prior written approval, permits, licenses, safety data, certificates, or specialist handling. Acceptance at booking does not override a lawful inspection, seizure, rejection, return, or disposal decision by an authority."
        ]
      }
    ]
  }
} as const satisfies Record<string, LegalPage>;

export function getLegalPage(key: keyof typeof legalPages) {
  return legalPages[key];
}
