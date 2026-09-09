import { ChatPageClient } from "@/components/chat/chat-page-client";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({
  title: "Fly Logistics AI Assistant - Shipment Help, Quotes, and Tracking",
  description: "Ask the Fly Logistics AI Assistant about delivery quotes, tracking IDs, pickup planning, urgent shipments, routes, and logistics support.",
  path: "/chat",
  keywords: ["AI logistics assistant", "logistics chatbot", "shipment help", "tracking support", "AI logistics platform", "Nigeria logistics support"]
});

export default function ChatPage() {
  return <ChatPageClient />;
}
