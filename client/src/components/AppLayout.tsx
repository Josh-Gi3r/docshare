import { useAuth } from "@/_core/hooks/useAuth";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Upload, LogOut, Menu, X, FolderOpen } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { AuthModal } from "@/components/AuthModal";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
}

const navItems = [
  { href: "/dashboard", label: "DOCUMENTS", icon: LayoutDashboard },
  { href: "/upload", label: "UPLOAD", icon: Upload },
  { href: "/folders", label: "TEAM FOLDERS", icon: FolderOpen },
];

export default function AppLayout({ children, title }: AppLayoutProps) {
  const { user, isAuthenticated, loading } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = "/"; },
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="font-mono text-xs uppercase tracking-widest text-gray-400 animate-pulse">
          LOADING...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <AuthModal open={true} />
      </div>
    );
  }

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
          <span className="font-sans text-xl font-bold tracking-tight text-white">DocShare</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = location === href || location.startsWith(href + "/");
          return (
            <Link key={href} href={href} onClick={() => setMobileOpen(false)}>
              <div
                className={`flex items-center gap-3 px-3 py-3 text-xs font-mono uppercase tracking-widest transition-all ${
                  isActive
                    ? "bg-[var(--color-brand)] text-[var(--color-brand-text)]"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon size={14} strokeWidth={2} />
                {label}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="px-4 py-5 border-t border-white/10">
        <div className="mb-3">
          <div className="text-xs font-mono text-white/40 uppercase tracking-widest mb-1">SIGNED IN AS</div>
          <div className="text-sm font-sans font-semibold text-white truncate">{user?.name || user?.email || "User"}</div>
        </div>
        <button
          onClick={() => logout.mutate()}
          className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-white/40 hover:text-[var(--color-brand)] transition-colors"
        >
          <LogOut size={12} />
          SIGN OUT
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-white flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-56 bg-black text-white flex-col fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-black text-white flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div>
          <Link href="/dashboard">
            <span className="font-sans text-lg font-bold tracking-tight text-white">DocShare</span>
          </Link>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 text-white/60 hover:text-white"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/60"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`md:hidden fixed top-0 left-0 bottom-0 z-50 w-72 bg-black text-white flex flex-col transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-end px-4 py-3 border-b border-white/10">
          <button onClick={() => setMobileOpen(false)} className="p-2 text-white/60 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <SidebarContent />
      </aside>

      {/* Main content */}
      <main className="flex-1 md:ml-56 min-h-screen bg-white pt-[52px] md:pt-0">
        {title && (
          <div className="border-b border-black px-4 md:px-8 py-4 bg-white">
            <h1 className="font-sans text-base md:text-lg font-bold uppercase tracking-tight">{title}</h1>
          </div>
        )}
        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
