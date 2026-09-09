import Link from "next/link";
import type { Route as NextRoute } from "next";
import { ArrowRight, BriefcaseBusiness, Truck, UserPlus, Users } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AccessOption = {
  title: string;
  description: string;
  href: string;
  icon: typeof BriefcaseBusiness;
};

const loginOptions: AccessOption[] = [
  {
    title: "Customer Login",
    description: "Track shipments, view quotes, pay invoices, save addresses, and receive delivery confirmations.",
    href: "/customer/login",
    icon: BriefcaseBusiness
  },
  {
    title: "Driver Login",
    description: "Open assigned deliveries, update route status, share location, and submit delivery proof.",
    href: "/driver/login",
    icon: Truck
  },
  {
    title: "Dispatcher Login",
    description: "Coordinate drivers, monitor live fleet activity, and update shipment timelines.",
    href: "/dispatcher/login",
    icon: Users
  }
];

const registerOptions: AccessOption[] = [
  {
    title: "Create Customer Account",
    description: "Book shipments, keep quote history, view payments, and manage delivery communication.",
    href: "/customer/register",
    icon: UserPlus
  },
  {
    title: "Register as Driver/Rider",
    description: "Create a driver profile for delivery assignments, availability, and proof workflows.",
    href: "/driver/register",
    icon: Truck
  }
];

export function AccessSelector({ mode }: { mode: "login" | "register" }) {
  const options = mode === "login" ? loginOptions : registerOptions;
  const title = mode === "login" ? "Choose your Fly Logistics workspace." : "Create the right Fly Logistics account.";
  const description =
    mode === "login"
      ? "Customers, drivers, and dispatchers each have a dedicated secure entry point. Admin access is private and not listed publicly."
      : "Customer and driver accounts can be created here. Admin access is assigned privately by Fly Logistics operations.";

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex justify-center">
          <Logo />
        </div>
        <section className="mx-auto mt-8 max-w-3xl text-center">
          <Badge className="border-primary/40 bg-primary/10 text-primary">{mode === "login" ? "Secure login" : "Account setup"}</Badge>
          <h1 className="mt-5 text-3xl font-black tracking-normal sm:text-5xl">{title}</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          {options.map((option) => (
            <Card key={option.href} className="glass">
              <CardHeader className="flex-row items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-md border border-primary/30 bg-primary/10 text-primary">
                  <option.icon className="size-5" />
                </span>
                <div>
                  <CardTitle className="text-xl">{option.title}</CardTitle>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{option.description}</p>
                </div>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full">
                  <Link href={option.href as NextRoute}>
                    Continue <ArrowRight />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground sm:flex-row">
          <Link className="text-primary" href={(mode === "login" ? "/register" : "/login") as NextRoute}>
            {mode === "login" ? "Need to create an account?" : "Already have an account?"}
          </Link>
          <Link className="text-primary" href="/customer/register">Create a customer account to book shipment</Link>
        </div>
      </div>
    </main>
  );
}
