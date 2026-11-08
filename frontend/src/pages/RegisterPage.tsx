import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";
import { usePlatformStore } from "@/stores/platformStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/PasswordInput";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteHeader } from "@/components/layout/PublicLayout";
import { ApiError } from "@/lib/api";

export function RegisterPage() {
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);
  const appName = usePlatformStore((s) => s.appName);
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await register(fullName, email, password);
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Same header as every other page — signing in is part of the site,
          not a separate grey screen. */}
      <SiteHeader />
      {/* Way out — a visitor who changed their mind must never feel trapped. */}
      <div className="mx-auto w-full max-w-[1200px] px-4 pt-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else window.location.assign("/");
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border bg-card px-3 py-1.5 text-[12.5px] font-bold text-foreground transition hover:bg-muted"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <Link
          to="/"
          className="ml-2 inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-[12.5px] font-semibold text-muted-foreground transition hover:text-foreground"
        >
          Continue browsing without signing in
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-6">
      <Card className="w-full max-w-[400px] shadow-sm border-slate-200">
        <CardHeader className="space-y-1">
          <CardTitle className="text-base font-semibold">Create account</CardTitle>
          <CardDescription className="text-xs">
            Join {appName()} with email (optional — guest needs no signup)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs">
                Full name
              </Label>
              <Input
                id="name"
                className="h-9"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                className="h-9"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs">
                Password
              </Label>
              <PasswordInput
                id="password"
                className="h-9"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                autoComplete="new-password"
                required
              />
            </div>
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
            <Button type="submit" className="w-full h-9" disabled={loading}>
              {loading ? "Creating…" : "Register"}
            </Button>
          </form>
          <div className="mt-4 text-center text-xs text-slate-500">
            Already have an account?{" "}
            <Link to="/login" className="text-[#2f6fed] hover:underline">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
