import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { BRANCHES, YEARS, fileTypeLabel } from "@/lib/constants";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Your profile — CampusCache" }] }),
  component: ProfilePage,
});

interface MyResource {
  id: string; title: string; file_type: string; download_count: number; created_at: string; file_path: string;
}

function ProfilePage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [year, setYear] = useState("");
  const [saving, setSaving] = useState(false);
  const [mine, setMine] = useState<MyResource[]>([]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: "/profile" } });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (profile) {
      setName(profile.full_name ?? "");
      setBranch(profile.branch ?? "");
      setYear(profile.year ? String(profile.year) : "");
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    supabase.from("resources").select("id,title,file_type,download_count,created_at,file_path")
      .eq("uploaded_by", user.id).order("created_at", { ascending: false })
      .then(({ data }) => setMine((data as MyResource[]) ?? []));
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: name || null, branch: branch || null, year: year ? Number(year) : null,
    }).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Profile updated"); await refreshProfile(); }
  };

  const remove = async (r: MyResource) => {
    if (!confirm(`Delete "${r.title}"?`)) return;
    await supabase.storage.from("resources").remove([r.file_path]);
    const { error } = await supabase.from("resources").delete().eq("id", r.id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); setMine(mine.filter((m) => m.id !== r.id)); }
  };

  if (loading || !user) return <div className="min-h-screen bg-background"><Header /></div>;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-4xl px-6 py-16 lg:px-8">
        <p className="text-xs uppercase tracking-[0.3em] text-mint">— your account</p>
        <h1 className="mt-3 font-serif text-4xl sm:text-5xl text-foreground">
          {profile?.full_name || "Profile"}
        </h1>

        <div className="mt-10 rounded-2xl border border-border/60 bg-card/60 p-8">
          <h2 className="font-serif text-2xl mb-6">Edit details</h2>
          <div className="space-y-4">
            <div>
              <Label>Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 bg-background" />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Branch</Label>
                <Select value={branch} onValueChange={setBranch}>
                  <SelectTrigger className="mt-2 bg-background"><SelectValue placeholder="Pick" /></SelectTrigger>
                  <SelectContent>{BRANCHES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Year</Label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger className="mt-2 bg-background"><SelectValue placeholder="Pick" /></SelectTrigger>
                  <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={save} disabled={saving} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>

        <div className="mt-10">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-serif text-3xl">Your contributions</h2>
            <Button asChild variant="outline" className="border-mint/40">
              <Link to="/contribute">Upload another</Link>
            </Button>
          </div>

          {mine.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-card/40 p-12 text-center">
              <FileText className="h-10 w-10 mx-auto text-mint/60 mb-4" />
              <p className="font-serif text-xl">No uploads yet</p>
              <p className="mt-2 text-sm text-muted-foreground">Share your first resource to help juniors.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {mine.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card/60 p-4">
                  <Link to="/resource/$id" params={{ id: r.id }} className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate hover:text-mint">{r.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {fileTypeLabel(r.file_type)} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </div>
                  </Link>
                  <div className="text-xs text-mint flex items-center gap-1"><Download className="h-3 w-3" /> {r.download_count}</div>
                  <button onClick={() => remove(r)} className="text-muted-foreground hover:text-destructive p-2">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
