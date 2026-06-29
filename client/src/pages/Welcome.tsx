import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export function Welcome() {
  const [, navigate] = useLocation();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Read email from URL query params
  const params = new URLSearchParams(window.location.search);
  const email = params.get("email") || "";

  // Redirect to home if no email param (direct navigation without magic link)
  useEffect(() => {
    if (!email) {
      navigate("/");
    }
  }, [email, navigate]);

  const completeProfile = trpc.auth.completeProfile.useMutation({
    onSuccess: () => {
      navigate("/dashboard");
    },
    onError: (err) => {
      setError(err.message);
      setSubmitting(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    if (!trimmedFirst || !trimmedLast) {
      setError("Please enter both your first and last name.");
      return;
    }
    setSubmitting(true);
    completeProfile.mutate({
      email,
      firstName: trimmedFirst,
      lastName: trimmedLast,
    });
  };

  if (!email) return null;

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      {/* Subtle background grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight text-white">
              DocShare
            </span>
            <span className="text-xs tracking-[0.15em] text-white/40 uppercase">DocSend</span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-8 shadow-2xl backdrop-blur-sm">
          {/* Welcome icon */}
          <div className="w-14 h-14 rounded-full bg-[var(--color-brand)]/10 border border-[var(--color-brand)]/30 flex items-center justify-center mx-auto mb-6">
            <svg className="w-7 h-7 text-[var(--color-brand)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-white text-center mb-2 tracking-tight">
            Welcome to DocShare
          </h1>
          <p className="text-white/50 text-sm text-center mb-2">
            Signing in as
          </p>
          <p className="text-white/80 text-sm text-center font-medium mb-8">
            {email}
          </p>
          <p className="text-white/40 text-xs text-center mb-8">
            Before we create your account, please tell us your name.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-white/40 mb-1.5 tracking-wide uppercase">
                  First name
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                  required
                  autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2.5 text-white placeholder:text-white/20 focus:outline-none focus:border-[var(--color-brand)]/60 focus:ring-1 focus:ring-[var(--color-brand)]/30 transition-colors text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1.5 tracking-wide uppercase">
                  Last name
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Smith"
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2.5 text-white placeholder:text-white/20 focus:outline-none focus:border-[var(--color-brand)]/60 focus:ring-1 focus:ring-[var(--color-brand)]/30 transition-colors text-sm"
                />
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting || !firstName.trim() || !lastName.trim()}
              className="w-full bg-[var(--color-brand)] hover:bg-[#00e87a] disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold py-3 rounded-md transition-colors text-sm tracking-wide mt-2"
            >
              {submitting ? "Creating account..." : "Create account"}
            </button>
          </form>
        </div>

        <p className="text-center text-white/20 text-xs mt-6">
          Only @docshare.example.com email addresses can access this platform.
        </p>
      </div>
    </div>
  );
}
