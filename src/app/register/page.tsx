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
      console.log(res)

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
            <p className="text-base-content/60 text-sm">Join GitLab Sanitation Dashboard</p>
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
            <div className="divider text-xs opacity-60">or continue with</div>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" className="btn btn-outline w-full h-12 justify-center">
                {/* Google mark (same as login) */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="size-4" aria-hidden>
                  <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.169 32.243 29.004 35 24 35c-7.18 0-13-5.82-13-13s5.82-13 13-13c3.313 0 6.326 1.243 8.59 3.267l5.657-5.657C34.046 3.042 29.268 1 24 1 10.745 1 0 11.745 0 25s10.745 24 24 24 24-10.745 24-24c0-1.627-.167-3.217-.389-4.917z"/>
                  <path fill="#FF3D00" d="M0 25c0 13.255 10.745 24 24 24 5.268 0 10.046-2.042 13.747-5.41l-5.657-5.657C29.004 35 24 35 24 35c-5.004 0-9.169-2.757-11.303-6.917H1.949A23.902 23.902 0 010 25z"/>
                  <path fill="#4CAF50" d="M12.697 28.083A11.952 11.952 0 0112 25c0-1.061.148-2.087.421-3.083H1.949A23.902 23.902 0 000 25c0 3.874.92 7.527 2.543 10.771l10.154-7.688z"/>
                  <path fill="#1976D2" d="M24 13c3.313 0 6.326 1.243 8.59 3.267l5.657-5.657C34.046 3.042 29.268 1 24 1v12z"/>
                </svg>
                Google
              </button>
              <button type="button" className="btn btn-outline w-full h-12 justify-center">
                <Github className="size-4" />
                GitHub
              </button>
            </div>
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
