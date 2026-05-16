"use client";

import { useState } from "react";
import { Bot, Loader2, Send, Sparkles, UserRound } from "lucide-react";
import { SiteHeader } from "@/components/brand/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ChatPage() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("Ask me about pricing, pickup requirements, delivery urgency, route planning, or tracking support.");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendMessage() {
    const trimmed = message.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI assistant failed to respond.");

      setReply(data.reply);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI assistant failed to respond.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[0.72fr_1.28fr] lg:px-8">
        <section className="flex flex-col justify-between rounded-lg border bg-black p-6 text-white shadow-2xl">
          <div>
            <Badge className="border-white/20 bg-white/10 text-white">Groq AI assistant</Badge>
            <h1 className="mt-5 text-4xl font-black tracking-normal text-balance">Shipment intelligence in plain English.</h1>
            <p className="mt-4 text-sm leading-6 text-white/70">
              Ask about quotes, pickup details, urgent cargo, tracking IDs, route planning, and Fly Logistics service options.
            </p>
          </div>
          <div className="mt-8 grid gap-3">
            {["Pickup and delivery planning", "Shipment tracking support", "Urgency and cargo recommendations"].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-md border border-white/10 bg-white/5 p-3 text-sm">
                <Sparkles className="size-4 text-primary" />
                {item}
              </div>
            ))}
          </div>
        </section>

        <Card className="glass flex min-h-[620px] flex-col overflow-hidden">
          <div className="border-b p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-md bg-primary text-primary-foreground">
                <Bot className="size-5" />
              </div>
              <div>
                <h2 className="font-semibold">Fly AI Command Desk</h2>
                <p className="text-sm text-muted-foreground">Modern logistics support, powered by Groq</p>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <div className="flex gap-3">
              <div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
                <Bot className="size-4" />
              </div>
              <div className="max-w-[82%] rounded-lg border bg-background/70 p-4 text-sm leading-6">{reply}</div>
            </div>
            {message && (
              <div className="flex justify-end gap-3">
                <div className="max-w-[82%] rounded-lg bg-primary p-4 text-sm leading-6 text-primary-foreground">{message}</div>
                <div className="grid size-8 shrink-0 place-items-center rounded-md border">
                  <UserRound className="size-4" />
                </div>
              </div>
            )}
            {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
          </div>

          <div className="border-t p-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Ask about a shipment, quote, route, or tracking ID..."
                rows={3}
                className="min-h-24 flex-1 resize-none rounded-md border bg-background/70 px-4 py-3 text-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button onClick={sendMessage} disabled={loading || !message.trim()} className="sm:self-end">
                {loading ? <Loader2 className="animate-spin" /> : <Send />}
                {loading ? "Thinking" : "Send"}
              </Button>
            </div>
          </div>
        </Card>
      </main>
    </>
  );
}
