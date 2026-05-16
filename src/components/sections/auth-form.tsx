import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fields = {
  login: ["Email", "Password"],
  register: ["Full name", "Company", "Email", "Password"],
  forgot: ["Email"],
  otp: ["One-time passcode"]
};

export function AuthForm({ mode }: { mode: keyof typeof fields }) {
  const titles = {
    login: "Welcome back",
    register: "Create your logistics command center",
    forgot: "Reset your password",
    otp: "Verify secure access"
  };

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="glass">
          <CardHeader>
            <CardTitle>{titles[mode]}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4">
              {fields[mode].map((field) => (
                <div key={field} className="grid gap-2">
                  <Label htmlFor={field}>{field}</Label>
                  <Input id={field} type={field.toLowerCase().includes("password") ? "password" : "text"} placeholder={field} />
                </div>
              ))}
              <Button type="submit" className="mt-2">{mode === "register" ? "Create account" : "Continue"}</Button>
            </form>
            <div className="mt-5 text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <span>No account? <Link className="text-primary" href="/auth/register">Register</Link></span>
              ) : (
                <Link className="text-primary" href="/auth/login">Back to login</Link>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
