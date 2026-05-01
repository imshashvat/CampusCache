import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Download, Sparkles, Upload, Users, FileText, GraduationCap, ShieldCheck, Layers, Zap } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CountUp } from "@/components/CountUp";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { BRANCHES, FILE_TYPES } from "@/lib/constants";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CampusCache — The student vault for notes, PPTs, labs & PYQs" },
      { name: "description", content: "Download and contribute college study materials — notes, slides, lab files and past papers — organized by branch, year and semester. Free, fast, student-built." },
      { property: "og:title", content: "CampusCache — Student Resource Hub" },
      { property: "og:description", content: "The student-run vault for notes, slides, labs and PYQs that actually carry you through the semester." },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const [stats, setStats] = useState({ resources: 0, downloads: 0 });

  const fetchStats = async () => {
    const [{ count: rc }, { data: dl }] = await Promise.all([
      supabase.from("resources").select("*", { count: "exact", head: true }),
      supabase.from("resources").select("download_count"),
    ]);
    const totalDl = (dl ?? []).reduce((a, r) => a + (r.download_count ?? 0), 0);
    setStats({ resources: rc ?? 0, downloads: totalDl });
  };

  useEffect(() => {
    fetchStats();
    // Re-fetch whenever user navigates back to this tab
    const onVisible = () => { if (document.visibilityState === "visible") fetchStats(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Header />

      {/* HERO */}
      <section className="relative overflow-hidden grain">
        {/* Aurora mesh */}
        <div className="absolute inset-0 -z-10 bg-mesh animate-aurora" />
        {/* Floating blobs */}
        <div className="absolute -top-20 -left-20 h-[420px] w-[420px] rounded-full bg-mint/15 blur-[110px] -z-10 animate-blob" />
        <div className="absolute top-40 -right-20 h-[460px] w-[460px] rounded-full bg-violet/15 blur-[120px] -z-10 animate-blob" style={{ animationDelay: "-6s" }} />
        <div className="absolute bottom-0 left-1/3 h-[360px] w-[360px] rounded-full bg-coral/10 blur-[100px] -z-10 animate-blob" style={{ animationDelay: "-12s" }} />

        <div className="mx-auto max-w-7xl px-6 pt-20 pb-28 lg:pt-32 lg:pb-40 lg:px-8 text-center relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-mint/30 bg-card/60 px-4 py-1.5 text-xs uppercase tracking-[0.2em] font-mono text-mint backdrop-blur animate-fade-up">
            <Sparkles className="h-3 w-3" /> built by students · free forever
          </div>

          <h1 className="mt-8 font-serif text-5xl sm:text-6xl lg:text-8xl leading-[0.95] text-foreground animate-fade-up" style={{ animationDelay: "80ms" }}>
            Your campus.<br />
            One <span className="italic-serif text-gradient-primary">cache</span> of<br />
            <span className="text-gradient-warm">everything</span> you need.
          </h1>

          <p className="mx-auto mt-8 max-w-2xl text-lg text-muted-foreground leading-relaxed animate-fade-up" style={{ animationDelay: "160ms" }}>
            CampusCache is a student-built library of notes, presentations, assignments, lab files and past papers —
            organized by branch, year and semester. <span className="italic-serif text-foreground">Always free.</span>
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4 animate-fade-up" style={{ animationDelay: "240ms" }}>
            <Button asChild size="lg" className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-soft h-12 px-8">
              <Link to="/browse">
                Browse the cache <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-mint/40 text-foreground hover:bg-accent h-12 px-8">
              <Link to="/contribute">Drop a file</Link>
            </Button>
          </div>

          {/* Stats */}
          <div className="mt-24 grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/50 rounded-2xl overflow-hidden border border-border/60 max-w-4xl mx-auto backdrop-blur">
            {[
              { label: "Resources", value: stats.resources, suffix: "+" },
              { label: "Downloads", value: stats.downloads, suffix: "+" },
              { label: "Branches", value: BRANCHES.length, suffix: "" },
              { label: "Free, always", value: 100, suffix: "%" },
            ].map((s) => (
              <div key={s.label} className="bg-card/70 p-6 sm:p-8">
                <div className="font-serif text-4xl sm:text-5xl text-gradient-primary">
                  <CountUp end={s.value} suffix={s.suffix} />
                </div>
                <div className="mt-2 text-[10px] uppercase tracking-[0.22em] font-mono text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
        <div className="flex items-end justify-between mb-12 flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] font-mono text-mint">— catalog</p>
            <h2 className="mt-3 font-serif text-4xl sm:text-5xl text-foreground">
              Every <span className="italic-serif text-gradient-primary">format</span> you'll need
            </h2>
          </div>
          <Link to="/browse" className="text-sm text-mint hover:underline underline-offset-4">View all →</Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {FILE_TYPES.map((t, i) => (
            <Link
              key={t.value}
              to="/browse"
              search={{ type: t.value }}
              className="group relative rounded-2xl border border-border/60 bg-card/60 p-6 hover:border-mint/50 transition-all hover:-translate-y-1 shadow-card animate-fade-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                style={{ backgroundColor: `${t.color.replace(")", " / 0.18)")}`, color: t.color }}
              >
                <FileText className="h-5 w-5" />
              </div>
              <div className="font-serif text-xl text-foreground">{t.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">Curated {t.label.toLowerCase()}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* WHAT WE OFFER */}
      <section className="bg-card/30 border-y border-border/60 relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-mesh opacity-40" />
        <div className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs uppercase tracking-[0.3em] font-mono text-mint">— what we offer</p>
            <h2 className="mt-3 font-serif text-4xl sm:text-5xl text-foreground">
              Built with <span className="italic-serif text-gradient-warm">intention</span>
            </h2>
            <p className="mt-4 text-muted-foreground">Every detail considered, so you can focus on what matters: your work.</p>
          </div>

          <div className="mt-16 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Layers, title: "Organized properly", body: "Filter by branch, year, semester and type. No more scrolling endless WhatsApp groups." },
              { icon: Zap, title: "Instant downloads", body: "No waiting, no captchas, no nonsense. One click and the file is yours." },
              { icon: Upload, title: "Easy contributions", body: "Sign up in seconds, drag-drop your file, and instantly help thousands of juniors." },
              { icon: ShieldCheck, title: "Verified sources", body: "Admin-curated materials sit alongside community contributions, clearly labeled." },
              { icon: Users, title: "Built by students", body: "Made by people who actually used these resources at 2 AM the night before exams." },
              { icon: Sparkles, title: "Free, forever", body: "No paywalls, no premium tier, no ads. Knowledge should be a commons, not a market." },
            ].map((f, i) => (
              <div key={f.title} className="rounded-2xl border border-border/60 bg-background/40 p-8 hover:border-mint/40 transition-all hover:-translate-y-0.5 backdrop-blur" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="h-11 w-11 rounded-xl bg-mint/10 text-mint flex items-center justify-center mb-5">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-serif text-2xl text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-7xl px-6 py-24 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-xs uppercase tracking-[0.3em] font-mono text-mint">— how it works</p>
          <h2 className="mt-3 font-serif text-4xl sm:text-5xl text-foreground">
            Three steps to <span className="italic-serif text-gradient-primary">better notes</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {[
            { n: "01", icon: BookOpen, title: "Browse", body: "Pick your branch, year and semester. Find exactly what you need." },
            { n: "02", icon: Download, title: "Download", body: "Tap once. The file is on your device — preview, study, repeat." },
            { n: "03", icon: GraduationCap, title: "Give back", body: "Aced a subject? Upload your notes. Be the senior you wished you had." },
          ].map((s) => (
            <div key={s.n} className="relative rounded-2xl border border-border/60 bg-card/60 p-8 hover:border-mint/40 transition-all">
              <div className="absolute -top-4 left-8 font-serif font-mono text-6xl text-mint/20">{s.n}</div>
              <div className="mt-6 h-12 w-12 rounded-xl bg-gradient-primary flex items-center justify-center text-primary-foreground shadow-soft">
                <s.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-6 font-serif text-2xl text-foreground">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 pb-24 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-mint/30 bg-card/70 p-12 lg:p-20 text-center shadow-soft">
          <div className="absolute inset-0 -z-10 bg-mesh animate-aurora opacity-60" />
          <p className="text-xs uppercase tracking-[0.3em] font-mono text-mint">— join the cache</p>
          <h2 className="mt-4 font-serif text-4xl sm:text-6xl text-foreground max-w-3xl mx-auto leading-tight">
            Knowledge belongs to <span className="italic-serif text-gradient-warm">everyone</span>.
          </h2>
          <p className="mt-6 max-w-xl mx-auto text-muted-foreground">
            Help build the resource you wish existed when you were a fresher.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button asChild size="lg" className="bg-gradient-primary text-primary-foreground hover:opacity-90 h-12 px-8">
              <Link to="/browse">Start browsing</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-mint/40 h-12 px-8">
              <Link to="/auth" search={{ redirect: "/" }}>Create an account</Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
