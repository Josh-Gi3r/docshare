import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";

interface AuthModalProps {
  open: boolean;
  onSuccess?: () => void;
}

type Step = "email" | "check_email";

export function AuthModal({ open, onSuccess }: AuthModalProps) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const sendLink = trpc.auth.sendOtp.useMutation({
    onSuccess: () => {
      setStep("check_email");
      setError("");
    },
    onError: (err) => setError(err.message),
  });

  useEffect(() => {
    if (!open) {
      setStep("email");
      setEmail("");
      setError("");
    }
  }, [open]);

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    sendLink.mutate({ email, origin: window.location.origin });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Dark backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-4 bg-black border border-white/10 rounded-lg p-8 shadow-2xl">
        {/* Logo */}
        <div className="mb-8">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-white">DocShare</span>
          </div>
        </div>

        {step === "email" ? (
          <>
            <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Sign in</h2>
            <p className="text-white/50 text-sm mb-8">
              Enter your email address to receive a sign-in link.
            </p>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-md px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--color-brand)]/60 focus:ring-1 focus:ring-[var(--color-brand)]/30 transition-colors text-sm"
                />
              </div>
              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}
              <button
                type="submit"
                disabled={sendLink.isPending || !email}
                className="w-full bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold py-3 rounded-md transition-colors text-sm tracking-wide"
              >
                {sendLink.isPending ? "Sending..." : "Send sign-in link"}
              </button>
            </form>
          </>
        ) : (
          <>
            {/* Check email screen */}
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-[var(--color-brand)]/10 border border-[var(--color-brand)]/30 flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-[var(--color-brand)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Check your email</h2>
              <p className="text-white/50 text-sm mb-2">
                We sent a sign-in link to
              </p>
              <p className="text-white font-medium text-sm mb-8">{email}</p>
              <p className="text-white/30 text-xs mb-8">
                Click the link in the email to sign in. The link expires in 15 minutes.
              </p>
              <button
                type="button"
                onClick={() => { setStep("email"); setError(""); }}
                className="text-white/40 hover:text-white/70 text-sm transition-colors"
              >
                ← Use a different email
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
