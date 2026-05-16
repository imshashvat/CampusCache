import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Upload, FileText, CheckCircle2, Trophy, Medal, Star,
  Download, Users, TrendingUp, RefreshCw,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { BRANCHES, YEARS, SEMESTERS, FILE_TYPES, formatBytes } from "@/lib/constants";

const MAX_SIZE = 25 * 1024 * 1024;

const schema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(120),
  description: z.string().trim().max(800).optional(),
  file_type: z.enum(["notes", "ppt", "assignment", "lab", "pyq", "other"]),
  branch: z.string().min(1, "Pick a branch"),
  year: z.number().int().min(1).max(4),
  semester: z.number().int().min(1).max(8),
  subject: z.string().trim().max(80).optional(),
});

type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/contribute")({
  head: () => ({
    meta: [
      { title: "Contribute a resource — CampusCache" },
      { name: "description", content: "Share your notes, PPTs, or lab files with thousands of students. Instant publish, full attribution." },
    ],
  }),
  component: ContributePage,
});

interface LeaderboardEntry {
  user_id: string;
  full_name: string | null;
  branch: string | null;
  monthly_points: number;
  all_time_points: number;
  upload_count: number;
  downloads_received: number;
  ratings_received: number;
}

const BADGE_DEFS = [
  { key: "first_upload",   label: "First Upload",     icon: "🎯", check: (e: LeaderboardEntry) => e.upload_count >= 1 },
  { key: "100_downloads",  label: "100 Downloads",    icon: "📥", check: (e: LeaderboardEntry) => e.downloads_received >= 100 },
  { key: "power_uploader", label: "Power Uploader",   icon: "🔥", check: (e: LeaderboardEntry) => e.upload_count >= 10 },
  { key: "well_rated",     label: "Well Rated",       icon: "⭐", check: (e: LeaderboardEntry) => e.ratings_received >= 5 },
  { key: "500_downloads",  label: "500 Downloads",    icon: "🏅", check: (e: LeaderboardEntry) => e.downloads_received >= 500 },
] as const;

function getBadges(entry: LeaderboardEntry) {
  return BADGE_DEFS.filter((b) => b.check(entry));
}

const PODIUM_STYLES = [
  { ring: "ring-2 ring-amber-400/60", bg: "bg-amber-400/10", label: "text-amber-400", crown: "🥇", order: "order-1" },
  { ring: "ring-2 ring-slate-400/60", bg: "bg-slate-400/10",  label: "text-slate-400",  crown: "🥈", order: "order-first lg:order-0" },
  { ring: "ring-2 ring-orange-600/60", bg: "bg-orange-600/10", label: "text-orange-500", crown: "🥉", order: "order-2" },
];

function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [filterBranch, setFilterBranch] = useState<string>("");
  const [tab, setTab] = useState<"monthly" | "alltime">("monthly");

  const load = async (branch?: string) => {
    setEntries(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("get_leaderboard", {
        p_branch: branch || null,
        p_limit: 50,
      });
      if (error) throw error;
      setEntries((data ?? []) as LeaderboardEntry[]);
    } catch (err) {
      console.error(err);
      setEntries([]);
      toast.error("Could not load leaderboard");
    }
  };

  useEffect(() => { load(filterBranch || undefined); }, [filterBranch]);

  const sorted = [...(entries ?? [])].sort((a, b) =>
    tab === "monthly"
      ? b.monthly_points - a.monthly_points
      : b.all_time_points - a.all_time_points
  );

  const podium = sorted.slice(0, 3);
  const rest   = sorted.slice(3);
  const pointKey = tab === "monthly" ? "monthly_points" : "all_time_points";

  return (
    <div className="mt-16 pt-16 border-t border-border/60">
      {/* Header */}
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] font-mono text-mint">— community</p>
          <h2 className="mt-2 font-serif text-3xl sm:text-4xl text-foreground">
            Contributor <span className="italic-serif text-gradient-primary">Leaderboard</span>
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Points: upload ×10 · download received ×1 · featured ×5 · rating received ×2
          </p>
        </div>
        <button
          onClick={() => load(filterBranch || undefined)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-mint transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Branch filter */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        <button
          onClick={() => setFilterBranch("")}
          className={`rounded-full px-3 py-1 text-xs border transition-colors ${!filterBranch ? "bg-mint text-background border-mint" : "border-border/60 text-muted-foreground hover:border-mint/40"}`}
        >All branches</button>
        {BRANCHES.map((b) => (
          <button
            key={b}
            onClick={() => setFilterBranch(b === filterBranch ? "" : b)}
            className={`rounded-full px-3 py-1 text-xs border transition-colors ${filterBranch === b ? "bg-mint text-background border-mint" : "border-border/60 text-muted-foreground hover:border-mint/40"}`}
          >{b}</button>
        ))}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "monthly" | "alltime")}>
        <TabsList className="bg-card mb-8">
          <TabsTrigger value="monthly">
            <TrendingUp className="h-3.5 w-3.5 mr-1.5" /> Last 30 Days
          </TabsTrigger>
          <TabsTrigger value="alltime">
            <Trophy className="h-3.5 w-3.5 mr-1.5" /> All Time
          </TabsTrigger>
        </TabsList>

        {(["monthly", "alltime"] as const).map((t) => (
          <TabsContent key={t} value={t}>
            {entries === null ? (
              <div className="text-center py-16 text-muted-foreground text-sm">Loading leaderboard…</div>
            ) : sorted.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-card/40 p-12 text-center">
                <Users className="h-10 w-10 mx-auto text-mint/40 mb-3" />
                <p className="text-muted-foreground">No contributors yet{filterBranch ? ` for ${filterBranch}` : ""}. Be the first!</p>
              </div>
            ) : (
              <>
                {/* Podium — top 3 */}
                {podium.length > 0 && (
                  <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-8 items-end">
                    {podium.map((entry, idx) => {
                      const s = PODIUM_STYLES[idx];
                      const badges = getBadges(entry);
                      return (
                        <div
                          key={entry.user_id}
                          className={`relative rounded-2xl border ${s.ring} ${s.bg} p-4 sm:p-6 text-center flex flex-col items-center ${s.order} ${idx === 0 ? "pb-8" : ""}`}
                        >
                          <div className="text-2xl sm:text-3xl mb-2">{s.crown}</div>
                          <div className={`text-xs sm:text-sm font-mono uppercase tracking-widest ${s.label} mb-1`}>#{idx + 1}</div>
                          <div className="font-serif text-base sm:text-xl text-foreground leading-tight">
                            {entry.full_name ?? "Anonymous"}
                          </div>
                          {entry.branch && (
                            <div className="mt-1 text-[10px] text-muted-foreground">{entry.branch}</div>
                          )}
                          <div className={`mt-3 font-serif text-2xl sm:text-3xl font-bold ${s.label}`}>
                            {(entry[pointKey] as number).toLocaleString()}
                            <span className="text-xs ml-1 opacity-70">pts</span>
                          </div>
                          <div className="mt-2 flex flex-wrap justify-center gap-1">
                            {badges.slice(0, 3).map((b) => (
                              <span key={b.key} title={b.label} className="text-base">{b.icon}</span>
                            ))}
                          </div>
                          <div className="mt-3 flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
                            <span className="flex items-center gap-0.5"><Upload className="h-3 w-3" />{entry.upload_count}</span>
                            <span className="flex items-center gap-0.5"><Download className="h-3 w-3" />{entry.downloads_received}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Rest of ranking table */}
                {rest.length > 0 && (
                  <div className="rounded-xl border border-border/60 bg-card/60 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border/60 text-xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="text-left p-3 w-10">#</th>
                          <th className="text-left p-3">Contributor</th>
                          <th className="text-left p-3 hidden sm:table-cell">Branch</th>
                          <th className="text-left p-3 hidden md:table-cell">Uploads</th>
                          <th className="text-left p-3 hidden md:table-cell">DLs</th>
                          <th className="text-left p-3">Points</th>
                          <th className="text-left p-3 hidden sm:table-cell">Badges</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rest.map((entry, idx) => {
                          const badges = getBadges(entry);
                          return (
                            <tr key={entry.user_id} className="border-b border-border/40 hover:bg-accent/20">
                              <td className="p-3 font-mono text-muted-foreground text-xs">{idx + 4}</td>
                              <td className="p-3 font-medium">{entry.full_name ?? "Anonymous"}</td>
                              <td className="p-3 hidden sm:table-cell text-muted-foreground text-xs">{entry.branch ?? "—"}</td>
                              <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">{entry.upload_count}</td>
                              <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">{entry.downloads_received}</td>
                              <td className="p-3 text-mint font-medium">{(entry[pointKey] as number).toLocaleString()}</td>
                              <td className="p-3 hidden sm:table-cell">
                                {badges.map((b) => (
                                  <span key={b.key} title={b.label} className="mr-1">{b.icon}</span>
                                ))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Badge legend */}
      <div className="mt-8 rounded-xl border border-border/60 bg-card/40 p-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Badge legend</p>
        <div className="flex flex-wrap gap-3">
          {BADGE_DEFS.map((b) => (
            <div key={b.key} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-base">{b.icon}</span>
              <span className="font-medium text-foreground">{b.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContributePage() {
  const { user, profile, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { file_type: "notes", branch: "", year: 1, semester: 1 },
  });

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (f.size > MAX_SIZE) { toast.error(`File too large (max ${formatBytes(MAX_SIZE)})`); return; }
    setFile(f);
  };

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: "/contribute" } });
  }, [user, loading, navigate]);

  const onSubmit = async (values: FormValues) => {
    if (!user) return;
    if (!file) { toast.error("Please attach a file"); return; }
    if (file.size > MAX_SIZE) { toast.error(`File too large (max ${formatBytes(MAX_SIZE)})`); return; }

    setSubmitting(true);
    setUploadProgress(0);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

      const { data: sessionData } = await supabase.auth.getSession();
      const authToken = sessionData?.session?.access_token;
      if (!authToken) throw new Error("Not authenticated — please sign in again.");

      await new Promise<void>((resolve, reject) => {
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/resources/${path}`);
        xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
        xhr.setRequestHeader("x-upsert", "false");
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 90));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) { setUploadProgress(90); resolve(); }
          else reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(file);
      });

      setUploadProgress(95);
      const { data: inserted, error: insErr } = await supabase.from("resources").insert({
        ...values,
        file_path: path,
        file_size: file.size,
        uploaded_by: user.id,
        is_admin_upload: isAdmin,
      }).select().single();
      if (insErr) throw insErr;

      setUploadProgress(100);
      toast.success("Resource published 🎉");
      navigate({ to: "/resource/$id", params: { id: inserted.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
      setUploadProgress(0);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user) return <div className="min-h-screen bg-background"><Header /></div>;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-3xl px-6 py-16 lg:px-8">
        <p className="text-xs uppercase tracking-[0.3em] text-mint">— give back</p>
        <h1 className="mt-3 font-serif text-4xl sm:text-5xl text-foreground">
          Contribute a <span className="italic-serif text-gradient-primary">resource</span>
        </h1>
        <p className="mt-3 text-muted-foreground">
          Uploads are published instantly under your name{isAdmin && <span className="text-mint"> (or as Admin, since you have admin rights)</span>}.
        </p>

        {/* Points reminder */}
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-mint/20 bg-mint/5 px-4 py-3 text-sm">
          <Star className="h-4 w-4 text-mint shrink-0" />
          <span className="text-muted-foreground">
            Earn <span className="text-mint font-medium">+10 points</span> per upload,
            <span className="text-mint font-medium"> +1</span> per download of your file,
            <span className="text-mint font-medium"> +2</span> per rating received.
          </span>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-10 space-y-6">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" {...form.register("title")} placeholder="e.g. Operating Systems — complete handwritten notes" className="mt-2 bg-card" />
            {form.formState.errors.title && <p className="text-xs text-destructive mt-1">{form.formState.errors.title.message}</p>}
          </div>

          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea id="description" {...form.register("description")} rows={3} placeholder="What's in this file? Topics covered, source, etc." className="mt-2 bg-card" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>File type</Label>
              <Select defaultValue="notes" onValueChange={(v) => form.setValue("file_type", v as never)}>
                <SelectTrigger className="mt-2 bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>{FILE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" {...form.register("subject")} placeholder="e.g. Operating Systems" className="mt-2 bg-card" />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <Label>Branch</Label>
              <Select onValueChange={(v) => form.setValue("branch", v)}>
                <SelectTrigger className="mt-2 bg-card"><SelectValue placeholder="Pick" /></SelectTrigger>
                <SelectContent>{BRANCHES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
              {form.formState.errors.branch && <p className="text-xs text-destructive mt-1">{form.formState.errors.branch.message}</p>}
            </div>
            <div>
              <Label>Year</Label>
              <Select defaultValue="1" onValueChange={(v) => form.setValue("year", Number(v) as never)}>
                <SelectTrigger className="mt-2 bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Semester</Label>
              <Select defaultValue="1" onValueChange={(v) => form.setValue("semester", Number(v) as never)}>
                <SelectTrigger className="mt-2 bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>{SEMESTERS.map((s) => <SelectItem key={s} value={String(s)}>Sem {s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>File</Label>
            <label
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              className={`mt-2 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card/40 transition-all cursor-pointer p-10 text-center ${dragOver ? "border-mint bg-mint/10 scale-[1.01]" : "border-border hover:border-mint/40"}`}
            >
              <input type="file" className="hidden" onChange={(e) => handleFiles(e.target.files)} accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.rar" />
              {file ? (
                <>
                  <FileText className="h-8 w-8 text-mint" />
                  <div className="font-medium text-foreground">{file.name}</div>
                  <div className="text-xs text-muted-foreground">{formatBytes(file.size)} · click or drop another to change</div>
                </>
              ) : (
                <>
                  <Upload className={`h-8 w-8 transition-transform ${dragOver ? "text-mint scale-125" : "text-mint"}`} />
                  <div className="font-medium text-foreground">{dragOver ? "Drop it here" : "Drag a file here, or click to browse"}</div>
                  <div className="text-xs text-muted-foreground">PDF, DOC, PPT, XLS, ZIP — up to {formatBytes(MAX_SIZE)}</div>
                </>
              )}
            </label>
          </div>

          <div className="flex items-center justify-between pt-4">
            <Link to="/browse" className="text-sm text-muted-foreground hover:text-foreground">Cancel</Link>
            <Button type="submit" disabled={submitting} size="lg" className="bg-gradient-primary text-primary-foreground hover:opacity-90 px-8 h-12">
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                  Uploading {uploadProgress > 0 ? `${uploadProgress}%` : ""}
                </span>
              ) : (
                <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Publish resource</span>
              )}
            </Button>
          </div>

          {submitting && (
            <div className="w-full bg-border/40 rounded-full h-1.5 overflow-hidden">
              <div className="bg-gradient-primary h-full rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}

          <p className="text-xs text-muted-foreground italic-serif">
            By publishing, you confirm you have the right to share this material{profile?.full_name && `, ${profile.full_name}`}.
          </p>
        </form>

        {/* ── LEADERBOARD ── */}
        <Leaderboard />
      </div>
      <Footer />
    </div>
  );
}
