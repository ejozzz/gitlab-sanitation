//app/register/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, UserPlus, User, Github } from "lucide-react";

/**
 * File: src/app/(auth)/register/page.tsx
 * Professional, theme-agnostic DaisyUI v5 register screen to match the login page
 * - Labels above inputs
 * - Inputs & button share the SAME width and height (w-full h-12)
 * - No page-level full-height wrapper; the layout handles centering & height
 * - Client-side validation + POST to /api/auth/register
 */
export default function RegisterPage() {
  const router = useRouter();

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [showPw2, setShowPw2] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const u = username.trim();
    const p1 = password.trim();
    const p2 = confirm.trim();

    if (!u || !p1 || !p2) {
      setError("Please fill in all fields");
      return;
    }
    if (p1.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (p1 !== p2) {
      setError("Passwords do not match");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: u, password: p1 }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Registration failed");

      // success → go to settings onboarding
      router.push("/login");
    } catch (e: any) {
      setError(e?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="w-full max-w-[420px] mx-auto p-0">
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body gap-6">
          {/* Heading */}
          <header className="flex flex-col items-center text-center gap-2">
            <div className="inline-flex items-center justify-center size-12 rounded-2xl bg-primary/10 text-primary">
              <UserPlus className="size-6" />
            </div>
            <h1 className="text-2xl font-bold">Create your account</h1>
            <p className="text-base-content/60 text-sm">Join GitLab Dashboard</p>
          </header>

          {/* Error */}
          {error && (
            <div role="alert" className="alert alert-error">
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="grid gap-4">
            {/* Username */}
            <label className="form-control">
              <div className="label">
                <span className="label-text">Username</span>
              </div>
              <div className="input input-bordered w-full h-12 flex items-center gap-2">
                <User className="size-4 opacity-60" />
                <input
                  name="username"
                  type="text"
                  placeholder="yourname"
                  autoComplete="username"
                  className="grow min-w-0 bg-transparent outline-none"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
            </label>

            {/* Password */}
            <label className="form-control">
              <div className="label">
                <span className="label-text">Password</span>
              </div>
              <div className="input input-bordered w-full h-12 flex items-center gap-2">
                <Lock className="size-4 opacity-60" />
                <input
                  name="password"
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="grow min-w-0 bg-transparent outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="btn btn-ghost btn-xs"
                  onClick={() => setShowPw((s) => !s)}
                >
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <div className="label mt-1 pt-0">
                <span className="label-text-alt text-xs opacity-70">At least 6 characters</span>
              </div>
            </label>

            {/* Confirm Password */}
            <label className="form-control">
              <div className="label">
                <span className="label-text">Confirm password</span>
              </div>
              <div className="input input-bordered w-full h-12 flex items-center gap-2">
                <Lock className="size-4 opacity-60" />
                <input
                  name="confirm"
                  type={showPw2 ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="grow min-w-0 bg-transparent outline-none"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
                <button
                  type="button"
                  aria-label={showPw2 ? "Hide password" : "Show password"}
                  className="btn btn-ghost btn-xs"
                  onClick={() => setShowPw2((s) => !s)}
                >
                  {showPw2 ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>

            {/* Submit */}
            <button type="submit" className="btn btn-primary w-full h-12" disabled={loading}>
              {loading ? (
                <span className="loading loading-spinner" />
              ) : (
                <span className="inline-flex items-center gap-2">
                  <UserPlus className="size-4" />
                  Create account
                </span>
              )}
            </button>

            {/* Divider (optional social) */}
            
          </form>

          {/* Footer */}
          <p className="text-center text-sm text-base-content/70">
            Already have an account? <Link href="/login" className="link link-hover">Sign in</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
