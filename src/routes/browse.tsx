import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Download, X, FileText, SlidersHorizontal, Trash2, Filter, Star, Bookmark, BookmarkCheck, Share2 } from "lucide-react";
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
  faculty: z.string().optional(),
  sort: z.enum(["new", "popular", "rating"]).optional(),
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
  faculty_name: string | null;
  section: string | null;
  file_size: number | null;
  is_admin_upload: boolean;
  is_featured: boolean;
  download_count: number;
  avg_rating: number;
  rating_count: number;
  created_at: string;
  uploaded_by: string | null;
  shared_branches?: string[] | null;
  profiles?: { full_name: string | null } | null;
}

const PAGE_SIZE = 24;
type PageCursor = { val: string | number; id: string };

function BrowsePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  const [resources, setResources] = useState<Resource[] | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<PageCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search_q, setQ] = useState(search.q ?? "");
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => { setQ(search.q ?? ""); }, [search.q]);

  const { data: subjectsData } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("resources").select("subject").not("subject", "is", null).limit(1000);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r) => (r.subject ?? "").trim()).filter(Boolean))).sort() as string[];
    },
    staleTime: 300_000,
  });
  const subjects = subjectsData ?? [];

  const { data: facultiesData } = useQuery({
    queryKey: ["faculties"],
    queryFn: async () => {
      const { data, error } = await supabase.from("resources").select("faculty_name").not("faculty_name", "is", null).limit(1000);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return Array.from(new Set((data ?? []).map((r) => ((r as any).faculty_name ?? "").trim()).filter(Boolean))).sort() as string[];
    },
    staleTime: 300_000,
  });
  const faculties = facultiesData ?? [];

  const { data: bookmarkedIds, refetch: refetchBookmarks } = useQuery({
    queryKey: ["bookmarks", user?.id],
    queryFn: async () => {
      if (!user) return new Set<string>();
      const { data, error } = await supabase.from("bookmarks").select("resource_id").eq("user_id", user.id);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new Set<string>((data ?? []).map((b: any) => b.resource_id));
    },
    enabled: !!user,
    staleTime: 60_000,
  });
  const bookmarks = bookmarkedIds ?? new Set<string>();

  useEffect(() => {
    setCursor(null);
    setResources(null);
    setHasMore(false);
    setTotalCount(null);
  }, [search.branch, search.year, search.sem, search.type, search.subject, search.faculty, search.q, search.sort]);

  const sortCol =
    search.sort === "popular" ? "download_count"
    : search.sort === "rating" ? "avg_rating"
    : "created_at";

  const fetchPage = async (pageCursor: PageCursor | null, _cancelled: { current: boolean }) => {
    const runQuery = async (useSharedBranches: boolean) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabase
        .from("resources")
        .select("*", pageCursor ? {} : { count: "exact" })
        .order(sortCol, { ascending: false })
        .order("id", { ascending: false });

      if (search.branch) {
        if (useSharedBranches) {
          q = q.or(`branch.eq.${search.branch},shared_branches.cs.{${search.branch}}`);
        } else {
          q = q.eq("branch", search.branch);
        }
      }
      if (search.year) q = q.eq("year", search.year);
      if (search.sem) q = q.eq("semester", search.sem);
      if (search.type) q = q.eq("file_type", search.type);
      if (search.subject) q = q.eq("subject", search.subject);
      if (search.faculty) q = q.eq("faculty_name", search.faculty);
      if (search.q) q = q.textSearch("fts", search.q, { type: "websearch", config: "english" });

      if (pageCursor) {
        q = q.or(`${sortCol}.lt.${pageCursor.val},and(${sortCol}.eq.${pageCursor.val},id.lt.${pageCursor.id})`);
      }

      return q.limit(PAGE_SIZE) as Promise<{ data: unknown[] | null; error: { code?: string; message?: string } | null; count: number | null }>;
    };

    let { data, error, count } = await runQuery(true);
    if (error && (error.code === "42703" || error.message?.toLowerCase().includes("shared_branches"))) {
      ({ data, error, count } = await runQuery(false));
    }
    if (error) throw error;
    return { data: (data ?? []) as Resource[], count };
  };

  const resourcesQueryKey = [
    "resources",
    search.branch, search.year, search.sem, search.type, search.subject, search.faculty, search.q, search.sort,
  ] as const;

  const { isLoading: resourcesLoading } = useQuery({
    queryKey: resourcesQueryKey,
    queryFn: async () => {
      const cancelled = { current: false };
      const { data, count } = await fetchPage(null, cancelled);
      const hydrated = await attachUploaderProfiles(data);
      setResources(hydrated);
      setTotalCount(count ?? hydrated.length);
      setHasMore(data.length === PAGE_SIZE);
      if (data.length > 0) {
        const last = data[data.length - 1];
        setCursor({ val: (last as unknown as Record<string, unknown>)[sortCol] as string | number, id: last.id });
      }
      return hydrated;
    },
    enabled: resources === null,
    staleTime: 60_000,
  });

  const loadingInitial = resources === null && resourcesLoading;

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const cancelled = { current: false };
    try {
      const { data } = await fetchPage(cursor, cancelled);
      const hydrated = await attachUploaderProfiles(data);
      setResources((prev) => [...(prev ?? []), ...hydrated]);
      setHasMore(data.length === PAGE_SIZE);
      if (data.length > 0) {
        const last = data[data.length - 1];
        setCursor({ val: (last as unknown as Record<string, unknown>)[sortCol] as string | number, id: last.id });
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error("Load more failed:", err);
      toast.error("Failed to load more resources.");
    } finally {
      setLoadingMore(false);
    }
  };

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
    if (search.faculty) a.push({ key: "faculty", label: `👤 ${search.faculty}` });
    return a;
  }, [search]);

  const resultLabel = useMemo(() => {
    if (resources === null) return "Loading…";
    const shown = resources.length;
    const total = totalCount ?? shown;
    if (total > shown) return `Showing ${shown} of ${total} results`;
    return `${shown} result${shown === 1 ? "" : "s"}`;
  }, [resources, totalCount]);

  const handleToggleBookmark = async (resourceId: string, currentlyBookmarked: boolean) => {
    if (!user) { toast.error("Sign in to save resources"); return; }
    try {
      if (currentlyBookmarked) {
        await supabase.from("bookmarks").delete().eq("user_id", user.id).eq("resource_id", resourceId);
        toast.success("Removed from saved");
      } else {
        await supabase.from("bookmarks").insert({ user_id: user.id, resource_id: resourceId });
        toast.success("Saved to bookmarks");
      }
      refetchBookmarks();
    } catch {
      toast.error("Failed to update bookmark");
    }
  };

  const FilterContent = () => (
    <div className="space-y-8">
      <FilterGroup label="Branch">
        {BRANCHES.map((b) => (
          <FilterPill key={b} active={search.branch === b} onClick={() => { update({ branch: search.branch === b ? undefined : b }); setFilterOpen(false); }}>{b}</FilterPill>
        ))}
      </FilterGroup>
      <FilterGroup label="Year">
        {YEARS.map((y) => (
          <FilterPill key={y} active={search.year === y} onClick={() => { update({ year: search.year === y ? undefined : y }); setFilterOpen(false); }}>Year {y}</FilterPill>
        ))}
      </FilterGroup>
      <FilterGroup label="Semester">
        {SEMESTERS.map((s) => (
          <FilterPill key={s} active={search.sem === s} onClick={() => { update({ sem: search.sem === s ? undefined : s }); setFilterOpen(false); }}>Sem {s}</FilterPill>
        ))}
      </FilterGroup>
      <FilterGroup label="File type">
        {FILE_TYPES.map((t) => (
          <FilterPill key={t.value} active={search.type === t.value} onClick={() => { update({ type: search.type === t.value ? undefined : t.value }); setFilterOpen(false); }}>{t.label}</FilterPill>
        ))}
      </FilterGroup>
      {subjects.length > 0 && (
        <FilterGroup label={`Subject (${subjects.length})`}>
          <div className="max-h-56 overflow-y-auto pr-1 flex flex-wrap gap-1.5 -mr-1">
            {subjects.map((s) => (
              <FilterPill key={s} active={search.subject === s} onClick={() => { update({ subject: search.subject === s ? undefined : s }); setFilterOpen(false); }}>{s}</FilterPill>
            ))}
          </div>
        </FilterGroup>
      )}
      {faculties.length > 0 && (
        <FilterGroup label={`Faculty (${faculties.length})`}>
          <div className="max-h-48 overflow-y-auto pr-1 flex flex-wrap gap-1.5 -mr-1">
            {faculties.map((f) => (
              <FilterPill key={f} active={search.faculty === f} onClick={() => { update({ faculty: search.faculty === f ? undefined : f }); setFilterOpen(false); }}>{f}</FilterPill>
            ))}
          </div>
        </FilterGroup>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="border-b border-border/60 bg-card/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10 sm:py-12 lg:px-8">
          <p className="text-xs uppercase tracking-[0.3em] text-mint">— the library</p>
          <h1 className="mt-3 font-serif text-3xl sm:text-4xl lg:text-5xl text-foreground">
            Browse <span className="italic-serif text-gradient-primary">everything</span>
          </h1>
          <p className="mt-3 text-muted-foreground">Filter, search, download. No friction.</p>
          <div className="mt-6 sm:mt-8 flex gap-2 sm:gap-3 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search title, subject or description…"
                className="pl-9 h-11 bg-background text-sm"
                value={search_q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") update({ q: search_q || undefined }); }}
              />
            </div>
            <Button onClick={() => update({ q: search_q || undefined })} className="bg-gradient-primary text-primary-foreground hover:opacity-90 h-11 px-4 sm:px-6">
              Search
            </Button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-10 lg:px-8">
        <div className="flex items-center gap-3 mb-6 lg:hidden">
          <Button variant="outline" onClick={() => setFilterOpen(true)} className="flex items-center gap-2 border-border/60 hover:border-mint/40">
            <Filter className="h-4 w-4 text-mint" />
            Filters
            {activeFilters.length > 0 && (
              <span className="ml-1 h-4 w-4 rounded-full bg-mint text-primary-foreground text-[10px] flex items-center justify-center font-mono">
                {activeFilters.length}
              </span>
            )}
          </Button>
          <div className="text-sm text-muted-foreground">{resultLabel}</div>
        </div>

        <div className="grid lg:grid-cols-[260px_1fr] gap-10">
          <aside className="hidden lg:block space-y-8">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <SlidersHorizontal className="h-4 w-4 text-mint" /> Filters
            </div>
            <FilterContent />
          </aside>

          <main>
            <div className="hidden lg:flex items-center justify-between mb-6 flex-wrap gap-3">
              <div className="text-sm text-muted-foreground">{resultLabel}</div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Sort:</span>
                <button onClick={() => update({ sort: "new" })} className={search.sort !== "popular" && search.sort !== "rating" ? "text-mint underline underline-offset-4" : "text-muted-foreground hover:text-foreground"}>Newest</button>
                <span className="text-muted-foreground">·</span>
                <button onClick={() => update({ sort: "popular" })} className={search.sort === "popular" ? "text-mint underline underline-offset-4" : "text-muted-foreground hover:text-foreground"}>Most downloaded</button>
                <span className="text-muted-foreground">·</span>
                <button onClick={() => update({ sort: "rating" })} className={search.sort === "rating" ? "text-mint underline underline-offset-4" : "text-muted-foreground hover:text-foreground"}>
                  <Star className="inline h-3 w-3 mr-0.5 fill-current" />Top rated
                </button>
              </div>
            </div>
            <div className="flex lg:hidden items-center gap-2 text-sm mb-4">
              <span className="text-muted-foreground">Sort:</span>
              <button onClick={() => update({ sort: "new" })} className={search.sort !== "popular" && search.sort !== "rating" ? "text-mint underline underline-offset-4" : "text-muted-foreground"}>Newest</button>
              <span className="text-muted-foreground">·</span>
              <button onClick={() => update({ sort: "popular" })} className={search.sort === "popular" ? "text-mint underline underline-offset-4" : "text-muted-foreground"}>Popular</button>
              <span className="text-muted-foreground">·</span>
              <button onClick={() => update({ sort: "rating" })} className={search.sort === "rating" ? "text-mint underline underline-offset-4" : "text-muted-foreground"}>⭐ Rated</button>
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

            {loadingInitial && (
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56 bg-card" />)}
              </div>
            )}

            {resources && resources.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-10 sm:p-16 text-center">
                <FileText className="h-10 w-10 mx-auto text-mint/60 mb-4" />
                <h3 className="font-serif text-2xl text-foreground">Nothing here yet</h3>
                <p className="mt-2 text-sm text-muted-foreground">Be the first to contribute a resource for these filters.</p>
                <Button asChild className="mt-6 bg-gradient-primary text-primary-foreground hover:opacity-90">
                  <Link to="/contribute">Contribute one</Link>
                </Button>
              </div>
            )}

            {resources && resources.length > 0 && (
              <>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
                  {resources.map((r) => (
                    <ResourceCard
                      key={r.id}
                      r={r}
                      canDelete={isAdmin}
                      bookmarked={bookmarks.has(r.id)}
                      onDelete={(id) => setResources((prev) => (prev ?? []).filter((x) => x.id !== id))}
                      onToggleBookmark={handleToggleBookmark}
                    />
                  ))}
                </div>
                {hasMore && (
                  <div className="mt-8 flex justify-center">
                    <Button variant="outline" onClick={loadMore} disabled={loadingMore} className="border-mint/40 text-foreground hover:border-mint hover:bg-accent px-8">
                      {loadingMore ? "Loading…" : `Load ${PAGE_SIZE} more`}
                    </Button>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {filterOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setFilterOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-80 max-w-[90vw] bg-card border-r border-border/60 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-border/60">
              <span className="font-semibold text-foreground flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-mint" /> Filters
              </span>
              <button onClick={() => setFilterOpen(false)} className="h-8 w-8 flex items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <FilterContent />
            </div>
            {activeFilters.length > 0 && (
              <div className="p-5 border-t border-border/60">
                <button onClick={() => { navigate({ to: "/browse", search: {} }); setFilterOpen(false); }} className="w-full text-sm text-destructive hover:text-destructive/80 text-center">
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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

function ResourceCard({
  r, canDelete, bookmarked, onDelete, onToggleBookmark,
}: {
  r: Resource;
  canDelete: boolean;
  bookmarked: boolean;
  onDelete: (id: string) => void;
  onToggleBookmark: (id: string, currentlyBookmarked: boolean) => void;
}) {
  const color = fileTypeColor(r.file_type);
  const [deleting, setDeleting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const isShared = r.shared_branches && r.shared_branches.length > 0;

  const resourceUrl = typeof window !== "undefined" ? `${window.location.origin}/resource/${r.id}` : `/resource/${r.id}`;
  const shareText = `${r.title}${r.subject ? ` · ${r.subject}` : ` · ${r.branch} Year ${r.year}`} | CampusCache\n${resourceUrl}`;

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${r.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const { data: row } = await supabase.from("resources").select("file_path").eq("id", r.id).maybeSingle();
      if (row?.file_path) await supabase.storage.from("resources").remove([row.file_path]);
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

  const handleBookmark = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleBookmark(r.id, bookmarked);
  };

  const handleShareClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShareOpen((prev) => !prev);
  };

  const openShare = (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(url, "_blank", "noopener,noreferrer");
    setShareOpen(false);
  };

  const showTopRated = r.avg_rating >= 4.0 && r.rating_count >= 3;
  const showPopular = r.download_count >= 100;

  return (
    <Link
      to="/resource/$id"
      params={{ id: r.id }}
      className="group relative rounded-xl border border-border/60 bg-card/60 p-5 sm:p-6 hover:border-mint/40 hover:-translate-y-0.5 transition-all shadow-card flex flex-col"
    >
      {r.is_featured && (
        <div className="absolute top-3 right-3 text-[10px] uppercase tracking-widest text-mint">★ Featured</div>
      )}

      {/* Action buttons top-right (hover reveal) */}
      <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleBookmark}
          title={bookmarked ? "Remove bookmark" : "Save resource"}
          className="p-1.5 rounded-md bg-background/80 border border-border/60 text-muted-foreground hover:text-mint hover:border-mint/50 transition-colors"
        >
          {bookmarked ? <BookmarkCheck className="h-3.5 w-3.5 text-mint" /> : <Bookmark className="h-3.5 w-3.5" />}
        </button>
        {canDelete && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Delete resource"
            className="p-1.5 rounded-md bg-background/80 border border-border/60 text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-start gap-3 mb-4">
        <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color.replace(")", " / 0.15)"), color }}>
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <Badge variant="outline" className="text-[10px] border-current uppercase tracking-wider mb-1.5" style={{ color }}>
            {fileTypeLabel(r.file_type)}
          </Badge>
          <h3 className="font-serif text-base sm:text-lg leading-snug text-foreground group-hover:text-mint transition-colors line-clamp-2">{r.title}</h3>
        </div>
      </div>

      <div className="text-xs text-muted-foreground mb-1">
        {r.subject && <span className="text-foreground">{r.subject} · </span>}
        {r.branch} · Year {r.year} · Sem {r.semester}
      </div>

      {(r.faculty_name || r.section) && (
        <div className="text-[10px] text-muted-foreground/70 mb-2">
          {r.faculty_name && <span>👤 {r.faculty_name}</span>}
          {r.faculty_name && r.section && <span className="mx-1">·</span>}
          {r.section && <span>§ {r.section}</span>}
        </div>
      )}

      {isShared && (
        <div className="text-[10px] text-mint/70 mb-3">
          Also in: {(r.shared_branches ?? []).filter(b => b !== r.branch).join(", ")}
        </div>
      )}

      {(showTopRated || showPopular) && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {showTopRated && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 text-[10px] text-amber-400 font-medium">
              ⭐ {r.avg_rating.toFixed(1)} rated
            </span>
          )}
          {showPopular && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-mint/10 border border-mint/30 px-2 py-0.5 text-[10px] text-mint font-medium">
              📥 {r.download_count >= 500 ? "500+" : "100+"} downloads
            </span>
          )}
        </div>
      )}

      <div className="mt-auto pt-4 border-t border-border/60 flex items-center justify-between text-xs">
        <div className="text-muted-foreground truncate">
          {r.is_admin_upload ? <span className="text-mint">★ Admin</span> : <>by {r.profiles?.full_name ?? "Anonymous"}</>}
          <span className="mx-1.5">·</span>
          {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {r.avg_rating > 0 && (
            <span className="flex items-center gap-0.5 text-amber-400">
              <Star className="h-3 w-3 fill-amber-400" />
              <span className="font-mono">{r.avg_rating.toFixed(1)}</span>
            </span>
          )}
          <span className="flex items-center gap-1 text-mint">
            <Download className="h-3 w-3" /> {r.download_count}
          </span>
          <div className="relative">
            <button
              onClick={handleShareClick}
              title="Share this resource"
              className="p-1 rounded text-muted-foreground hover:text-mint transition-colors"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
            {shareOpen && (
              <div
                className="absolute right-0 bottom-6 z-20 flex flex-col gap-1 rounded-lg border border-border/60 bg-card shadow-lg p-2 min-w-[130px]"
                onClick={(e) => e.preventDefault()}
              >
                <button
                  onClick={(e) => openShare(e, `https://wa.me/?text=${encodeURIComponent(shareText)}`)}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent text-foreground whitespace-nowrap"
                >
                  <span>📱</span> WhatsApp
                </button>
                <button
                  onClick={(e) => openShare(e, `https://t.me/share/url?url=${encodeURIComponent(resourceUrl)}&text=${encodeURIComponent(r.title)}`)}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent text-foreground whitespace-nowrap"
                >
                  <span>✈️</span> Telegram
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">{formatBytes(r.file_size)}</div>
    </Link>
  );
}
