import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2 } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { BRANCHES, YEARS, SEMESTERS, FILE_TYPES, formatBytes } from "@/lib/constants";

const MAX_SIZE = 25 * 1024 * 1024; // 25MB

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

function ContributePage() {
  const { user, profile, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // 0-100

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

      // Get user's session token for authenticated upload
      const { data: sessionData } = await supabase.auth.getSession();
      const authToken = sessionData?.session?.access_token;

      if (!authToken) throw new Error("Not authenticated — please sign in again.");

      // Upload with progress tracking via XMLHttpRequest
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

          {/* Progress bar */}
          {submitting && (
            <div className="w-full bg-border/40 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-gradient-primary h-full rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}

          <p className="text-xs text-muted-foreground italic-serif">
            By publishing, you confirm you have the right to share this material{profile?.full_name && `, ${profile.full_name}`}.
          </p>
        </form>
      </div>
      <Footer />
    </div>
  );
}
