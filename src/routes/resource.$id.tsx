import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, ArrowLeft, FileText, Calendar, User as UserIcon, HardDrive, Trash2, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

/** Returns the filename from a storage path like "uploads/abc/my-file.pdf" */
function extractFilename(filePath: string, title: string): string {
  const parts = filePath.split("/");
  const last = parts[parts.length - 1];
  // If the stored name looks like a UUID, use the resource title instead
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(last);
  if (isUuid) {
    const ext = last.includes(".") ? "." + last.split(".").pop() : "";
    return title.replace(/[^a-z0-9_\-. ]/gi, "_") + ext;
  }
  return last;
}

function ResourceDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [r, setR] = useState<Resource | null | undefined>(undefined);
  const [downloading, setDownloading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  /** Auto-downloads the file directly to the user's device */
  const handleDownload = async () => {
    if (!r) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.storage.from("resources").createSignedUrl(r.file_path, 120);
      if (error || !data) throw error ?? new Error("Could not generate download URL");

      // Fetch as blob → trigger browser save-dialog directly (no new tab)
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

      // Increment counter in background
      supabase.rpc("increment_download_count", { _resource_id: r.id }).then(() => {
        setR((prev) => prev ? { ...prev, download_count: prev.download_count + 1 } : prev);
      });

      toast.success("Download started!");
    } catch (err) {
      console.error(err);
      toast.error("Download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  /** Opens the file in a new browser tab cleanly */
  const handleOpen = async () => {
    if (!r) return;
    setOpening(true);
    try {
      const { data, error } = await supabase.storage.from("resources").createSignedUrl(r.file_path, 300);
      if (error || !data) throw error ?? new Error("Could not generate URL");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
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

  if (r === undefined) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-5xl px-6 py-16">
          <Skeleton className="h-96 bg-card" />
        </div>
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
            {r.description && <p className="mt-6 text-foreground/80 leading-relaxed whitespace-pre-line">{r.description}</p>}

            {/* Preview */}
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
          </div>

          {/* Sidebar */}
          <aside className="lg:sticky lg:top-24 self-start space-y-3">
            {/* Download — saves file directly to device */}
            <Button
              id="download-btn"
              onClick={handleDownload}
              disabled={downloading}
              size="lg"
              className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90 h-12 shadow-soft"
            >
              <Download className="h-5 w-5" />
              {downloading ? "Downloading…" : "Download"}
            </Button>

            {/* Open — opens file in a new tab cleanly */}
            <Button
              id="open-btn"
              onClick={handleOpen}
              disabled={opening}
              variant="outline"
              size="lg"
              className="w-full h-11 border-border/60 text-muted-foreground hover:text-foreground hover:border-mint/40"
            >
              <ExternalLink className="h-4 w-4" />
              {opening ? "Opening…" : "Open in browser"}
            </Button>

            {isAdmin && (
              <Button
                onClick={handleDelete}
                disabled={deleting}
                variant="outline"
                className="w-full h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" /> {deleting ? "Deleting…" : "Delete this file"}
              </Button>
            )}

            <div className="rounded-xl border border-border/60 bg-card/60 p-6 space-y-4 text-sm">
              <Detail icon={UserIcon} label="Uploaded by" value={r.is_admin_upload ? "★ Admin" : (r.profiles?.full_name ?? "Anonymous")} valueClass={r.is_admin_upload ? "text-mint" : ""} />
              <Detail icon={Calendar} label="Added" value={formatDistanceToNow(new Date(r.created_at), { addSuffix: true })} />
              <Detail icon={HardDrive} label="Size" value={formatBytes(r.file_size)} />
              <Detail icon={Download} label="Downloads" value={r.download_count.toLocaleString()} />
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
