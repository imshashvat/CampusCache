import { Link, useNavigate } from "@tanstack/react-router";
import { Library, LogOut, Upload, User as UserIcon, Shield, Menu, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Header() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials = (profile?.full_name || user?.email || "U")
    .split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  const navLinks = [
    { to: "/", label: "Home", exact: true },
    { to: "/browse", label: "Browse" },
    { to: "/contribute", label: "Contribute" },
    { to: "/contact", label: "Contact" },
  ] as const;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-soft">
              <Library className="h-5 w-5" />
              <div className="absolute inset-0 rounded-xl animate-pulse-ring" />
            </div>
            <div className="leading-tight">
              <div className="font-serif text-xl text-foreground group-hover:text-mint transition-colors">CampusCache</div>
              <div className="text-[10px] uppercase tracking-[0.22em] font-mono text-muted-foreground">study · share · ace</div>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8 text-sm">
            {navLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="text-muted-foreground hover:text-foreground transition-colors"
                activeOptions={"exact" in l && l.exact ? { exact: true } : {}}
                activeProps={{ className: "text-foreground" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Mobile hamburger */}
            <button
              className="md:hidden flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 text-muted-foreground hover:text-foreground hover:border-mint/40 transition-colors"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex h-9 w-9 items-center justify-center rounded-full border border-mint/40 bg-card text-sm font-medium text-mint hover:bg-accent transition-colors">
                    {initials}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Signed in as<br />
                    <span className="text-foreground font-medium">{profile?.full_name || user.email}</span>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate({ to: "/profile" })}>
                    <UserIcon className="h-4 w-4" /> Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate({ to: "/contribute" })}>
                    <Upload className="h-4 w-4" /> Contribute
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => navigate({ to: "/admin" })}>
                      <Shield className="h-4 w-4" /> Admin
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={async () => { await signOut(); navigate({ to: "/" }); }}>
                    <LogOut className="h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Link to="/auth" search={{ redirect: "/" }} className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">Sign in</Link>
                <Button asChild className="bg-gradient-primary text-primary-foreground hover:opacity-90 hidden md:flex">
                  <Link to="/contribute">Contribute</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-card border-l border-border/60 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-border/60">
              <span className="font-serif text-lg text-foreground">Menu</span>
              <button
                onClick={() => setMobileOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex flex-col p-5 gap-1">
              {navLinks.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  activeOptions={"exact" in l && l.exact ? { exact: true } : {}}
                  activeProps={{ className: "rounded-lg px-4 py-3 text-sm text-foreground bg-accent" }}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto p-5 border-t border-border/60 space-y-2">
              {user ? (
                <>
                  <div className="text-xs text-muted-foreground px-1 mb-3">
                    Signed in as <span className="text-foreground">{profile?.full_name || user.email}</span>
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => { navigate({ to: "/profile" }); setMobileOpen(false); }}>
                    <UserIcon className="h-4 w-4 mr-2" /> Profile
                  </Button>
                  <Button variant="outline" className="w-full text-destructive border-destructive/40 hover:bg-destructive/10" onClick={async () => { await signOut(); navigate({ to: "/" }); setMobileOpen(false); }}>
                    <LogOut className="h-4 w-4 mr-2" /> Sign out
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90">
                    <Link to="/contribute" onClick={() => setMobileOpen(false)}>Contribute</Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/auth" search={{ redirect: "/" }} onClick={() => setMobileOpen(false)}>Sign in</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
