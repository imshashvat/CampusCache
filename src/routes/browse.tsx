import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useMemo, useState } from "react";
import { Search, Download, X, FileText, SlidersHorizontal, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { attachUploaderProfiles } from "@/lib/resources";
import { supabase } from "@/integrations/supabase/client";
import { BRANCHES, YEARS, SEMESTERS, FILE_TYPES, fileTypeColor, fileTypeLabel, formatBytes } from "@/lib/constants";
import { z } from "zod";

const searchSchema = z.object({
  q: z.string().optional(),
  branch: z.string().optional(),
  year: z.coerce.number().optional(),
  sem: z.coerce.number().optional(),
  type: z.string().optional(),
  subject: z.string().optional(),
  sort: z.enum(["new", "popular"]).optional(),
});

export const Route = createFileRoute("/browse")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Browse the library — CampusCache" },
      { name: "description", content: "Filter notes, PPTs, assignments and lab files by branch, year and semester. Free downloads, no signup needed." },
    ],
  }),
  component: BrowsePage,
});

interface Resource {
  id: string;
  title: string;
  description: string | null;
  file_type: string;
  branch: string;
  year: number;
  semester: number;
  subject: string | null;
  file_size: number | null;
  is_admin_upload: boolean;
  is_featured: boolean;
  download_count: number;
  created_at: string;
  uploaded_by: string | null;
  profiles?: { full_name: string | null } | null;
}

function BrowsePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [resources, setResources] = useState<Resource[] | null>(null);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [search_q, setQ] = useState(search.q ?? "");

  useEffect(() => { setQ(search.q ?? ""); }, [search.q]);

  // Load distinct subjects once
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from("resources").select("subject").not("subject", "is", null).limit(1000);
        if (error) throw error;
        const uniq = Array.from(new Set((data ?? []).map((r) => (r.subject ?? "").trim()).filter(Boolean))).sort();
        setSubjects(uniq);
      } catch (err) {
        console.error("Failed to load subjects:", err);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setResources(null);
      try {
        let query = supabase
          .from("resources")
          .select("*")
          .order(search.sort === "popular" ? "download_count" : "created_at", { ascending: false });

        if (search.branch) query = query.eq("branch", search.branch);
        if (search.year) query = query.eq("year", search.year);
        if (search.sem) query = query.eq("semester", search.sem);
        if (search.type) query = query.eq("file_type", search.type as never);
        if (search.subject) query = query.eq("subject", search.subject);
        if (search.q) query = query.or(`title.ilike.%${search.q}%,subject.ilike.%${search.q}%,description.ilike.%${search.q}%`);

        const { data, error } = await query.limit(60);
        if (error) throw error;
        if (cancelled) return;
        const hydratedResources = await attachUploaderProfiles((data as unknown as Resource[]) ?? []);
        if (!cancelled) setResources(hydratedResources);
      } catch (err) {
        console.error("Failed to load resources:", err);
        if (!cancelled) setResources([]);
        toast.error("Failed to load resources. Please check your connection.");
      }
    })();
    return () => { cancelled = true; };
  }, [search.branch, search.year, search.sem, search.type, search.subject, search.q, search.sort]);

  const update = (patch: Partial<typeof search>) => {
    navigate({ to: "/browse", search: { ...search, ...patch } });
  };

  const activeFilters = useMemo(() => {
    const a: { key: string; label: string }[] = [];
    if (search.branch) a.push({ key: "branch", label: search.branch });
    if (search.year) a.push({ key: "year", label: `Year ${search.year}` });
    if (search.sem) a.push({ key: "sem", label: `Sem ${search.sem}` });
    if (search.type) a.push({ key: "type", label: fileTypeLabel(search.type) });
    if (search.subject) a.push({ key: "subject", label: search.subject });
    return a;
  }, [search]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Page header */}
      <section className="border-b border-border/60 bg-card/30">
        <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
          <p className="text-xs uppercase tracking-[0.3em] text-mint">— the library</p>
          <h1 className="mt-3 font-serif text-4xl sm:text-5xl text-foreground">
            Browse <span className="italic-serif text-gradient-primary">everything</span>
          </h1>
          <p className="mt-3 text-muted-foreground">Filter, search, download. No friction.</p>

          <div className="mt-8 flex gap-3 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search title, subject or description…"
                className="pl-9 h-11 bg-background"
                value={search_q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") update({ q: search_q || undefined }); }}
              />
            </div>
            <Button onClick={() => update({ q: search_q || undefined })} className="bg-gradient-primary text-primary-foreground hover:opacity-90 h-11 px-6">
              Search
            </Button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-8 grid lg:grid-cols-[260px_1fr] gap-10">
        {/* Filters */}
        <aside className="space-y-8">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <SlidersHorizontal className="h-4 w-4 text-mint" /> Filters
          </div>

          <FilterGroup label="Branch">
            {BRANCHES.map((b) => (
              <FilterPill key={b} active={search.branch === b} onClick={() => update({ branch: search.branch === b ? undefined : b })}>{b}</FilterPill>
            ))}
          </FilterGroup>

          <FilterGroup label="Year">
            {YEARS.map((y) => (
              <FilterPill key={y} active={search.year === y} onClick={() => update({ year: search.year === y ? undefined : y })}>Year {y}</FilterPill>
            ))}
          </FilterGroup>

          <FilterGroup label="Semester">
            {SEMESTERS.map((s) => (
              <FilterPill key={s} active={search.sem === s} onClick={() => update({ sem: search.sem === s ? undefined : s })}>Sem {s}</FilterPill>
            ))}
          </FilterGroup>

          <FilterGroup label="File type">
            {FILE_TYPES.map((t) => (
              <FilterPill key={t.value} active={search.type === t.value} onClick={() => update({ type: search.type === t.value ? undefined : t.value })}>{t.label}</FilterPill>
            ))}
          </FilterGroup>

          {subjects.length > 0 && (
            <FilterGroup label={`Subject (${subjects.length})`}>
              <div className="max-h-56 overflow-y-auto pr-1 flex flex-wrap gap-1.5 -mr-1">
                {subjects.map((s) => (
                  <FilterPill key={s} active={search.subject === s} onClick={() => update({ subject: search.subject === s ? undefined : s })}>{s}</FilterPill>
                ))}
              </div>
            </FilterGroup>
          )}
        </aside>

        {/* Results */}
        <main>
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div className="text-sm text-muted-foreground">
              {resources === null ? "Loading…" : `${resources.length} result${resources.length === 1 ? "" : "s"}`}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Sort:</span>
              <button onClick={() => update({ sort: "new" })} className={search.sort !== "popular" ? "text-mint underline underline-offset-4" : "text-muted-foreground hover:text-foreground"}>Newest</button>
              <span className="text-muted-foreground">·</span>
              <button onClick={() => update({ sort: "popular" })} className={search.sort === "popular" ? "text-mint underline underline-offset-4" : "text-muted-foreground hover:text-foreground"}>Most downloaded</button>
            </div>
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {activeFilters.map((f) => (
                <button key={f.key} onClick={() => update({ [f.key]: undefined } as never)} className="inline-flex items-center gap-1.5 rounded-full bg-mint/10 border border-mint/30 px-3 py-1 text-xs text-mint hover:bg-mint/20">
                  {f.label} <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}

          {resources === null && (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56 bg-card" />)}
            </div>
          )}

          {resources && resources.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-16 text-center">
              <FileText className="h-10 w-10 mx-auto text-mint/60 mb-4" />
              <h3 className="font-serif text-2xl text-foreground">Nothing here yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">Be the first to contribute a resource for these filters.</p>
              <Button asChild className="mt-6 bg-gradient-primary text-primary-foreground hover:opacity-90">
                <Link to="/contribute">Contribute one</Link>
              </Button>
            </div>
          )}

          {resources && resources.length > 0 && (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {resources.map((r) => (
                <ResourceCard
                  key={r.id}
                  r={r}
                  canDelete={isAdmin}
                  onDelete={(id) => setResources((prev) => (prev ?? []).filter((x) => x.id !== id))}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      <Footer />
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-3">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs transition-colors border ${active ? "bg-mint text-primary-foreground border-mint" : "bg-card border-border/60 text-muted-foreground hover:text-foreground hover:border-mint/40"}`}
    >
      {children}
    </button>
  );
}

function ResourceCard({ r, canDelete, onDelete }: { r: Resource; canDelete: boolean; onDelete: (id: string) => void }) {
  const color = fileTypeColor(r.file_type);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${r.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      // Need file_path to remove from storage; fetch it
      const { data: row } = await supabase.from("resources").select("file_path").eq("id", r.id).maybeSingle();
      if (row?.file_path) {
        await supabase.storage.from("resources").remove([row.file_path]);
      }
      const { error } = await supabase.from("resources").delete().eq("id", r.id);
      if (error) throw error;
      toast.success("Resource deleted");
      onDelete(r.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Link
      to="/resource/$id"
      params={{ id: r.id }}
      className="group relative rounded-xl border border-border/60 bg-card/60 p-6 hover:border-mint/40 hover:-translate-y-0.5 transition-all shadow-card flex flex-col"
    >
      {r.is_featured && (
        <div className="absolute top-3 right-3 text-[10px] uppercase tracking-widest text-mint">★ Featured</div>
      )}
      {canDelete && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Delete resource"
          className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-background/80 border border-border/60 text-muted-foreground hover:text-destructive hover:border-destructive/50 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="flex items-start gap-3 mb-4">
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: color.replace(")", " / 0.15)"), color }}
        >
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <Badge variant="outline" className="text-[10px] border-current uppercase tracking-wider mb-1.5" style={{ color }}>
            {fileTypeLabel(r.file_type)}
          </Badge>
          <h3 className="font-serif text-lg leading-snug text-foreground group-hover:text-mint transition-colors line-clamp-2">{r.title}</h3>
        </div>
      </div>

      <div className="text-xs text-muted-foreground mb-4">
        {r.subject && <span className="text-foreground">{r.subject} · </span>}
        {r.branch} · Year {r.year} · Sem {r.semester}
      </div>

      <div className="mt-auto pt-4 border-t border-border/60 flex items-center justify-between text-xs">
        <div className="text-muted-foreground truncate">
          {r.is_admin_upload ? (
            <span className="text-mint">★ Admin</span>
          ) : (
            <>by {r.profiles?.full_name ?? "Anonymous"}</>
          )}
          <span className="mx-1.5">·</span>
          {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
        </div>
        <div className="flex items-center gap-1 text-mint shrink-0">
          <Download className="h-3 w-3" /> {r.download_count}
        </div>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">{formatBytes(r.file_size)}</div>
    </Link>
  );
}
