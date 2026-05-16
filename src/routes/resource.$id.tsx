import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Download, ArrowLeft, FileText, Calendar, User as UserIcon,
  HardDrive, Trash2, ExternalLink, Pencil, Check, X, Star,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { attachUploaderProfiles } from "@/lib/resources";
import { supabase } from "@/integrations/supabase/client";
import { fileTypeColor, fileTypeLabel, formatBytes } from "@/lib/constants";

export const Route = createFileRoute("/resource/$id")({
  component: ResourceDetail,
});

interface Resource {
  id: string; title: string; description: string | null; file_type: string;
  branch: string; year: number; semester: number; subject: string | null;
  file_path: string; file_size: number | null; uploaded_by: string | null;
  is_admin_upload: boolean; download_count: number; created_at: string;
  profiles?: { full_name: string | null } | null;
}

interface RatingData {
  myStars: number;       // 0 = not rated yet
  myTags: string[];
  myReview: string;
  avgStars: number;
  totalRatings: number;
  tagCounts: Record<string, number>;
  canRate: boolean;      // has the user downloaded this resource?
}

const QUALITY_TAGS = [
  "exam-focused", "easy language", "detailed", "concise",
  "well-structured", "outdated", "incomplete",
] as const;

function extractFilename(filePath: string, title: string): string {
  const parts = filePath.split("/");
  const last = parts[parts.length - 1];
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(last);
  if (isUuid) {
    const ext = last.includes(".") ? "." + last.split(".").pop() : "";
    return title.replace(/[^a-z0-9_\-. ]/gi, "_") + ext;
  }
  return last;
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          className="transition-transform hover:scale-110"
        >
          <Star
            className="h-7 w-7 transition-colors"
            fill={(hovered || value) >= n ? "oklch(0.78 0.16 175)" : "none"}
            stroke={(hovered || value) >= n ? "oklch(0.78 0.16 175)" : "currentColor"}
            strokeWidth={1.5}
          />
        </button>
      ))}
    </div>
  );
}

function StarDisplay({ avg, count }: { avg: number; count: number }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className="h-4 w-4"
            fill={avg >= n ? "oklch(0.78 0.16 175)" : avg >= n - 0.5 ? "oklch(0.78 0.16 175 / 0.5)" : "none"}
            stroke="oklch(0.78 0.16 175)"
            strokeWidth={1.5}
          />
        ))}
      </div>
      <span className="text-sm font-medium text-foreground">{avg.toFixed(1)}</span>
      <span className="text-xs text-muted-foreground">({count} {count === 1 ? "rating" : "ratings"})</span>
    </div>
  );
}

function ResourceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [r, setR] = useState<Resource | null | undefined>(undefined);
  const [downloading, setDownloading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit description state
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [savingDesc, setSavingDesc] = useState(false);

  // Rating state
  const [rating, setRating] = useState<RatingData | null>(null);
  const [ratingStars, setRatingStars] = useState(0);
  const [ratingTags, setRatingTags] = useState<string[]>([]);
  const [ratingReview, setRatingReview] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("resources")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        if (!data) { setR(null); return; }
        const [resourceWithProfile] = await attachUploaderProfiles([data as Resource]);
        setR(resourceWithProfile ?? null);
      } catch {
        setR(null);
      }
    })();
  }, [id]);

  // Load ratings data
  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: allRatings }, canRateResult, myRatingResult] = await Promise.all([
        // Community ratings — cast to any until migration adds 'ratings' to generated types
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("ratings").select("stars, tags, user_id").eq("resource_id", id),
        // Has user downloaded?
        user
          ? supabase.from("downloads").select("id", { count: "exact", head: true })
              .eq("resource_id", id).eq("user_id", user.id)
          : Promise.resolve({ count: 0 }),
        // User's existing rating
        user
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? (supabase as any).from("ratings").select("stars, tags, review").eq("resource_id", id).eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const rList = (allRatings ?? []) as { stars: number; tags: string[]; user_id: string }[];
      const avg = rList.length ? rList.reduce((a, x) => a + x.stars, 0) / rList.length : 0;
      const tagCounts: Record<string, number> = {};
      rList.forEach((rv) => rv.tags?.forEach((t: string) => { tagCounts[t] = (tagCounts[t] ?? 0) + 1; }));

      const canRate = (canRateResult as { count: number | null }).count != null
        ? ((canRateResult as { count: number | null }).count ?? 0) > 0
        : false;

      const my = (myRatingResult as { data: { stars: number; tags: string[]; review: string | null } | null }).data;
      const myStars = my?.stars ?? 0;
      const myTags = my?.tags ?? [];
      const myReview = my?.review ?? "";

      setRating({ myStars, myTags, myReview, avgStars: avg, totalRatings: rList.length, tagCounts, canRate });
      if (my) {
        setRatingStars(myStars);
        setRatingTags(myTags);
        setRatingReview(myReview);
        setRatingSubmitted(true);
      }
    })();
  }, [id, user]);

  const handleDownload = async () => {
    if (!r) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.storage.from("resources").createSignedUrl(r.file_path, 120);
      if (error || !data) throw error ?? new Error("Could not generate download URL");

      const response = await fetch(data.signedUrl);
      if (!response.ok) throw new Error("File fetch failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = extractFilename(r.file_path, r.title);
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(objectUrl);

      supabase.rpc("increment_download_count", { _resource_id: r.id }).then(() => {
        setR((prev) => prev ? { ...prev, download_count: prev.download_count + 1 } : prev);
        // Unlock rating after download
        setRating((prev) => prev ? { ...prev, canRate: true } : prev);
      });

      toast.success("Download started!");
    } catch (err) {
      console.error(err);
      toast.error("Download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const handleOpen = async () => {
    if (!r) return;
    setOpening(true);
    const win = window.open("about:blank", "_blank");
    if (!win) {
      toast.error("Popup blocked — please allow popups for this site and try again.");
      setOpening(false);
      return;
    }
    try {
      const ext = r.file_path.split(".").pop()?.toLowerCase() ?? "";
      const isPdf = ext === "pdf";
      const isOffice = ["ppt", "pptx", "doc", "docx", "xls", "xlsx"].includes(ext);

      if (isPdf) {
        const { data, error } = await supabase.storage.from("resources").createSignedUrl(r.file_path, 300, { download: false });
        if (error || !data) throw error ?? new Error("Could not generate URL");
        win.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>${r.title.replace(/</g, "&lt;")}</title><style>*{margin:0;padding:0;box-sizing:border-box;}html,body{width:100%;height:100%;background:#525659;}embed{display:block;width:100%;height:100%;}</style></head><body><embed src="${data.signedUrl}" type="application/pdf" width="100%" height="100%"/></body></html>`);
        win.document.close();
      } else if (isOffice) {
        const { data: pubData } = supabase.storage.from("resources").getPublicUrl(r.file_path);
        win.location.href = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(pubData.publicUrl)}`;
      } else {
        const { data, error } = await supabase.storage.from("resources").createSignedUrl(r.file_path, 300, { download: false });
        if (error || !data) throw error ?? new Error("Could not generate URL");
        win.location.href = data.signedUrl;
      }
    } catch (err) {
      console.error(err);
      win.close();
      toast.error("Could not open file. Please try downloading instead.");
    } finally {
      setOpening(false);
    }
  };

  const handleDelete = async () => {
    if (!r) return;
    if (!confirm(`Delete "${r.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await supabase.storage.from("resources").remove([r.file_path]);
      const { error } = await supabase.from("resources").delete().eq("id", r.id);
      if (error) throw error;
      toast.success("Resource deleted");
      navigate({ to: "/browse" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  };

  const startEditDesc = () => { setDescDraft(r?.description ?? ""); setEditingDesc(true); };
  const cancelEditDesc = () => { setEditingDesc(false); setDescDraft(""); };
  const saveDescription = async () => {
    if (!r) return;
    setSavingDesc(true);
    try {
      const { error } = await supabase.from("resources").update({ description: descDraft.trim() || null }).eq("id", r.id);
      if (error) throw error;
      setR((prev) => prev ? { ...prev, description: descDraft.trim() || null } : prev);
      setEditingDesc(false);
      toast.success("Description updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingDesc(false);
    }
  };

  const toggleRatingTag = (tag: string) => {
    setRatingTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  };

  const submitRating = async () => {
    if (!user || !r) return;
    if (ratingStars === 0) { toast.error("Please pick a star rating"); return; }
    setSubmittingRating(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("ratings").upsert({
        resource_id: r.id,
        user_id: user.id,
        stars: ratingStars,
        tags: ratingTags,
        review: ratingReview.trim() || null,
      }, { onConflict: "resource_id,user_id" });
      if (error) throw error;

      // Refresh community rating
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: allRatings } = await (supabase as any).from("ratings").select("stars, tags").eq("resource_id", r.id);
      const rList = (allRatings ?? []) as { stars: number; tags: string[] }[];
      const avg = rList.reduce((a, x) => a + x.stars, 0) / rList.length;
      const tagCounts: Record<string, number> = {};
      rList.forEach((rv) => rv.tags?.forEach((t: string) => { tagCounts[t] = (tagCounts[t] ?? 0) + 1; }));
      setRating((prev) => prev ? { ...prev, avgStars: avg, totalRatings: rList.length, tagCounts, myStars: ratingStars, myTags: ratingTags, myReview: ratingReview } : prev);
      setRatingSubmitted(true);
      toast.success("Rating submitted! Thank you ⭐");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit rating");
    } finally {
      setSubmittingRating(false);
    }
  };

  if (r === undefined) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-5xl px-6 py-16"><Skeleton className="h-96 bg-card" /></div>
      </div>
    );
  }

  if (r === null) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-3xl px-6 py-32 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-mint">— 404</p>
          <h1 className="mt-3 font-serif text-5xl text-foreground">Resource not found</h1>
          <p className="mt-3 text-muted-foreground">It may have been removed by its uploader.</p>
          <Link to="/browse" className="mt-8 inline-flex items-center gap-1.5 text-mint hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to the library
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const color = fileTypeColor(r.file_type);
  const publicUrl = supabase.storage.from("resources").getPublicUrl(r.file_path).data.publicUrl;
  const isPdf = r.file_path.toLowerCase().endsWith(".pdf");

  const topTags = Object.entries(rating?.tagCounts ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="mx-auto max-w-6xl px-6 py-10 lg:px-8">
        <Link to="/browse" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-mint mb-8">
          <ArrowLeft className="h-4 w-4" /> Back to library
        </Link>

        <div className="grid lg:grid-cols-[1fr_320px] gap-10">
          {/* Main */}
          <div>
            <Badge variant="outline" className="text-[10px] border-current uppercase tracking-wider" style={{ color }}>
              {fileTypeLabel(r.file_type)}
            </Badge>
            <h1 className="mt-4 font-serif text-4xl sm:text-5xl text-foreground leading-tight">{r.title}</h1>
            {r.subject && <p className="mt-3 text-lg text-muted-foreground italic-serif">{r.subject}</p>}

            {/* Community rating display */}
            {rating && rating.totalRatings > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <StarDisplay avg={rating.avgStars} count={rating.totalRatings} />
                {topTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {topTags.map(([tag, cnt]) => (
                      <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-card border border-border/60 px-2.5 py-0.5 text-[10px] text-muted-foreground">
                        {tag} <span className="text-mint font-mono">×{cnt}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            <div className="mt-6">
              {editingDesc ? (
                <div className="space-y-2">
                  <Textarea value={descDraft} onChange={(e) => setDescDraft(e.target.value)} placeholder="Add a description…" rows={4} className="bg-card/60 border-border/60 resize-none text-sm" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveDescription} disabled={savingDesc} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
                      <Check className="h-3.5 w-3.5" /> {savingDesc ? "Saving…" : "Save"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={cancelEditDesc} disabled={savingDesc}>
                      <X className="h-3.5 w-3.5" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="group relative">
                  {r.description
                    ? <p className="text-foreground/80 leading-relaxed whitespace-pre-line">{r.description}</p>
                    : <p className="text-muted-foreground/60 italic text-sm">No description provided.</p>
                  }
                  {isAdmin && (
                    <button onClick={startEditDesc} className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-mint transition-colors">
                      <Pencil className="h-3 w-3" /> {r.description ? "Edit description" : "Add description"}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* File preview */}
            <div className="mt-8 rounded-xl border border-border/60 bg-card/40 overflow-hidden" style={{ minHeight: 480 }}>
              {isPdf ? (
                <iframe src={publicUrl} className="w-full" style={{ height: 600 }} title={r.title} />
              ) : (
                <div className="p-16 text-center">
                  <div className="h-16 w-16 mx-auto rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: color.replace(")", " / 0.15)"), color }}>
                    <FileText className="h-8 w-8" />
                  </div>
                  <p className="font-serif text-2xl text-foreground">No preview available</p>
                  <p className="mt-2 text-sm text-muted-foreground">Download to view this {fileTypeLabel(r.file_type).toLowerCase()}.</p>
                </div>
              )}
            </div>

            {/* ── RATINGS SECTION ── */}
            <div className="mt-10 rounded-xl border border-border/60 bg-card/40 p-6">
              <h2 className="font-serif text-2xl text-foreground mb-1">Rate this resource</h2>
              <p className="text-sm text-muted-foreground mb-6">
                {rating?.canRate
                  ? ratingSubmitted
                    ? "You've rated this. You can update your rating below."
                    : "You downloaded this — share your thoughts to help others."
                  : user
                    ? "Download this resource first to leave a rating."
                    : "Sign in and download this resource to leave a rating."}
              </p>

              {rating?.canRate ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Your rating</p>
                    <StarPicker value={ratingStars} onChange={setRatingStars} />
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Quality tags (optional)</p>
                    <div className="flex flex-wrap gap-2">
                      {QUALITY_TAGS.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleRatingTag(tag)}
                          className={`rounded-full px-3 py-1 text-xs border transition-all ${ratingTags.includes(tag) ? "bg-mint text-background border-mint" : "bg-card border-border/60 text-muted-foreground hover:border-mint/40"}`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Review (optional)</p>
                    <Textarea
                      value={ratingReview}
                      onChange={(e) => setRatingReview(e.target.value)}
                      placeholder="What was helpful or lacking about this resource?"
                      rows={3}
                      className="bg-card/60 border-border/60 resize-none text-sm"
                    />
                  </div>

                  <Button
                    onClick={submitRating}
                    disabled={submittingRating || ratingStars === 0}
                    className="bg-gradient-primary text-primary-foreground hover:opacity-90"
                  >
                    <Star className="h-4 w-4" />
                    {submittingRating ? "Submitting…" : ratingSubmitted ? "Update rating" : "Submit rating"}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {!user
                    ? <Button asChild variant="outline" className="border-mint/40 hover:border-mint"><Link to="/auth" search={{ redirect: `/resource/${r.id}` }}>Sign in to rate</Link></Button>
                    : <Button onClick={handleDownload} className="bg-gradient-primary text-primary-foreground hover:opacity-90"><Download className="h-4 w-4" /> Download to unlock rating</Button>
                  }
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <aside className="lg:sticky lg:top-24 self-start space-y-3">
            <Button id="download-btn" onClick={handleDownload} disabled={downloading} size="lg" className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90 h-12 shadow-soft">
              <Download className="h-5 w-5" />
              {downloading ? "Downloading…" : "Download"}
            </Button>

            <Button id="open-btn" onClick={handleOpen} disabled={opening} variant="outline" size="lg" className="w-full h-11 border-border/60 text-muted-foreground hover:text-foreground hover:border-mint/40">
              <ExternalLink className="h-4 w-4" />
              {opening ? "Opening…" : "Open in browser"}
            </Button>

            {isAdmin && (
              <Button onClick={handleDelete} disabled={deleting} variant="outline" className="w-full h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="h-4 w-4" /> {deleting ? "Deleting…" : "Delete this file"}
              </Button>
            )}

            <div className="rounded-xl border border-border/60 bg-card/60 p-6 space-y-4 text-sm">
              <Detail icon={UserIcon} label="Uploaded by" value={r.is_admin_upload ? "★ Admin" : (r.profiles?.full_name ?? "Anonymous")} valueClass={r.is_admin_upload ? "text-mint" : ""} />
              <Detail icon={Calendar} label="Added" value={formatDistanceToNow(new Date(r.created_at), { addSuffix: true })} />
              <Detail icon={HardDrive} label="Size" value={formatBytes(r.file_size)} />
              <Detail icon={Download} label="Downloads" value={r.download_count.toLocaleString()} />
              {rating && rating.totalRatings > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-2 text-muted-foreground"><Star className="h-4 w-4" /> Rating</span>
                  <span className="font-medium text-foreground">{rating.avgStars.toFixed(1)} ★ <span className="text-xs text-muted-foreground">({rating.totalRatings})</span></span>
                </div>
              )}
              <div className="pt-4 border-t border-border/60 grid grid-cols-3 gap-2 text-center">
                <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Branch</div><div className="mt-1 font-serif text-lg">{r.branch}</div></div>
                <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Year</div><div className="mt-1 font-serif text-lg">{r.year}</div></div>
                <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sem</div><div className="mt-1 font-serif text-lg">{r.semester}</div></div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
}

function Detail({ icon: Icon, label, value, valueClass = "" }: { icon: typeof FileText; label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4" /> {label}</span>
      <span className={`font-medium text-foreground truncate ${valueClass}`}>{value}</span>
    </div>
  );
}
