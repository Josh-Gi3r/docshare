import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import { FileText, BarChart2, Lock, Eye, ArrowRight, Upload } from "lucide-react";
import { AuthModal } from "@/components/AuthModal";

const features = [
  {
    icon: Upload,
    title: "UPLOAD & SHARE",
    desc: "Drag and drop PDF or PPTX files. Get a unique shareable link instantly.",
  },
  {
    icon: Eye,
    title: "CUSTOM PREVIEW",
    desc: "Choose which slide appears as the link preview image on social media and messaging apps.",
  },
  {
    icon: BarChart2,
    title: "DEEP ANALYTICS",
    desc: "Track total views, unique visitors, time spent, and per-page engagement.",
  },
  {
    icon: Lock,
    title: "ACCESS CONTROL",
    desc: "Password protect links, set expiry dates, and enable or disable sharing at any time.",
  },
];

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      {/* Auth Modal */}
      <AuthModal open={authOpen} onSuccess={() => setAuthOpen(false)} />

      {/* Nav */}
      <header className="border-b border-black px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-sans text-xl font-bold tracking-tight">DocShare</span>
          <span className="ml-1 ds-tag hidden sm:inline-block">DOCSEND</span>
        </div>
        <div>
          {loading ? null : isAuthenticated ? (
            <Link href="/dashboard">
              <button className="flex items-center gap-2 px-4 md:px-5 py-2 bg-black text-white font-sans text-xs font-bold uppercase tracking-widest ds-shadow ds-hover">
                DASHBOARD <ArrowRight size={12} />
              </button>
            </Link>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className="flex items-center gap-2 px-4 md:px-5 py-2 bg-black text-white font-sans text-xs font-bold uppercase tracking-widest ds-shadow ds-hover"
            >
              SIGN IN <ArrowRight size={12} />
            </button>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="px-4 md:px-8 py-12 md:py-24 max-w-5xl mx-auto">
        <div className="mb-4">
          <span className="tag-brand">DOCUMENT INTELLIGENCE PLATFORM</span>
        </div>
        <h1 className="font-sans text-4xl md:text-6xl font-bold uppercase tracking-tight leading-none mb-6 max-w-3xl">
          SHARE DOCS.<br />
          <span className="text-[var(--color-brand)]" style={{ WebkitTextStroke: "2px #000", color: "var(--color-brand)" } as React.CSSProperties}>
            TRACK EVERYTHING.
          </span>
        </h1>
        <p className="text-base md:text-lg text-gray-600 max-w-xl mb-8 md:mb-10 leading-relaxed">
          Upload PDF and PPTX files. Generate shareable links with custom social previews.
          Track every view, every page, every second — with full access control.
        </p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {isAuthenticated ? (
            <Link href="/upload">
              <button className="flex items-center justify-center gap-3 px-6 md:px-8 py-4 bg-[var(--color-brand)] text-black font-sans font-bold text-sm uppercase tracking-widest border border-black ds-shadow ds-hover w-full sm:w-auto">
                <Upload size={16} />
                UPLOAD A DOCUMENT
              </button>
            </Link>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className="flex items-center justify-center gap-3 px-6 md:px-8 py-4 bg-[var(--color-brand)] text-black font-sans font-bold text-sm uppercase tracking-widest border border-black ds-shadow ds-hover"
            >
              <ArrowRight size={16} />
              GET STARTED
            </button>
          )}
          {isAuthenticated && (
            <Link href="/dashboard">
              <button className="flex items-center justify-center gap-3 px-6 md:px-8 py-4 bg-white text-black font-sans font-bold text-sm uppercase tracking-widest border border-black ds-shadow-sm ds-hover w-full sm:w-auto">
                VIEW DASHBOARD
              </button>
            </Link>
          )}
        </div>
      </section>

      {/* Feature grid */}
      <section className="px-4 md:px-8 py-12 md:py-16 border-t border-black bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8 md:mb-12">
            <span className="ds-tag">CAPABILITIES</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
            {features.map(({ icon: Icon, title, desc }, i) => (
              <div
                key={title}
                className="border border-black p-6 md:p-8 bg-white ds-shadow"
                style={{ marginTop: i > 0 ? "-1px" : 0, marginLeft: i % 2 === 1 ? "-1px" : 0 }}
              >
                <div className="w-10 h-10 bg-[var(--color-brand)] border border-black flex items-center justify-center mb-5">
                  <Icon size={18} strokeWidth={2} />
                </div>
                <h3 className="font-sans text-base font-bold uppercase tracking-tight mb-2">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black px-4 md:px-8 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <span className="font-sans text-sm font-bold tracking-tight">DocShare</span>
          <span className="ml-2 font-mono text-xs text-gray-400">DOCSEND</span>
        </div>
        <div className="font-mono text-xs text-gray-400 uppercase tracking-widest">
          DOCUMENT INTELLIGENCE
        </div>
      </footer>
    </div>
  );
}
