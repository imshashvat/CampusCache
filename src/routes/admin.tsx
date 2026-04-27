import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Star, FileText, Users, Download, Pin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { attachUploaderProfiles } from "@/lib/resources";
import { supabase } from "@/integrations/supabase/client";
import { fileTypeLabel } from "@/lib/constants";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — CampusCache" }] }),
  component: AdminPage,
});

interface AdminResource {
  id: string; title: string; file_type: string; branch: string; year: number; semester: number;
  download_count: number; created_at: string; is_featured: boolean; is_admin_upload: boolean;
  file_path: string; uploaded_by: string | null;
  profiles?: { full_name: string | null } | null;
}

interface AdminUser {
  id: string; full_name: string | null; created_at: string;
}

function AdminPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [resources, setResources] = useState<AdminResource[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState({ resources: 0, downloads: 0, users: 0 });
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate({ to: "/" });
  }, [user, isAdmin, loading, navigate]);

  const reload = async () => {
    const [r, u, roles, dl] = await Promise.all([
      supabase.from("resources").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("id,full_name,created_at").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id,role").eq("role", "admin"),
      supabase.from("resources").select("download_count"),
    ]);
    setResources(await attachUploaderProfiles((r.data as unknown as AdminResource[]) ?? []));
    setUsers((u.data as AdminUser[]) ?? []);
    setAdminIds(new Set((roles.data ?? []).map((x) => x.user_id)));
    setStats({
      resources: r.data?.length ?? 0,
      users: u.data?.length ?? 0,
      downloads: (dl.data ?? []).reduce((a, x) => a + (x.download_count ?? 0), 0),
    });
  };

  useEffect(() => { if (isAdmin) reload(); }, [isAdmin]);

  const togglePin = async (r: AdminResource) => {
    await supabase.from("resources").update({ is_featured: !r.is_featured }).eq("id", r.id);
    toast.success(r.is_featured ? "Unpinned" : "Featured");
    reload();
  };

  const deleteResource = async (r: AdminResource) => {
    if (!confirm(`Delete "${r.title}"?`)) return;
    await supabase.storage.from("resources").remove([r.file_path]);
    const { error } = await supabase.from("resources").delete().eq("id", r.id);
    if (error) toast.error(error.message);
    else { toast.success("Deleted"); reload(); }
  };

  const promoteUser = async (uid: string) => {
    const { error } = await supabase.from("user_roles").insert({ user_id: uid, role: "admin" });
    if (error) toast.error(error.message); else { toast.success("Promoted to admin"); reload(); }
  };

  const demoteUser = async (uid: string) => {
    if (uid === user?.id) { toast.error("You can't demote yourself"); return; }
    const { error } = await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", "admin");
    if (error) toast.error(error.message); else { toast.success("Admin removed"); reload(); }
  };

  if (loading || !isAdmin) return <div className="min-h-screen bg-background"><Header /></div>;

  const filtered = resources.filter((r) => !search || r.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <p className="text-xs uppercase tracking-[0.3em] text-mint">— admin</p>
        <h1 className="mt-3 font-serif text-4xl sm:text-5xl text-foreground">
          Mission <span className="italic-serif text-gradient-primary">control</span>
        </h1>

        <div className="mt-10 grid sm:grid-cols-3 gap-4">
          <StatTile icon={FileText} label="Resources" value={stats.resources} />
          <StatTile icon={Download} label="Total downloads" value={stats.downloads} />
          <StatTile icon={Users} label="Users" value={stats.users} />
        </div>

        <Tabs defaultValue="files" className="mt-10">
          <TabsList className="bg-card">
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
          </TabsList>

          <TabsContent value="files" className="mt-6">
            <Input placeholder="Search files…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md mb-4 bg-card" />
            <div className="rounded-xl border border-border/60 bg-card/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Title</th>
                    <th className="text-left p-3 hidden md:table-cell">Type</th>
                    <th className="text-left p-3 hidden lg:table-cell">Uploader</th>
                    <th className="text-left p-3 hidden lg:table-cell">Added</th>
                    <th className="text-left p-3">DL</th>
                    <th className="p-3 w-32"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-border/40 hover:bg-accent/20">
                      <td className="p-3">
                        <Link to="/resource/$id" params={{ id: r.id }} className="font-medium hover:text-mint">{r.title}</Link>
                        {r.is_featured && <Star className="inline h-3 w-3 ml-1 text-mint fill-mint" />}
                      </td>
                      <td className="p-3 hidden md:table-cell text-muted-foreground">{fileTypeLabel(r.file_type)}</td>
                      <td className="p-3 hidden lg:table-cell text-muted-foreground">{r.is_admin_upload ? <span className="text-mint">★ Admin</span> : (r.profiles?.full_name ?? "—")}</td>
                      <td className="p-3 hidden lg:table-cell text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</td>
                      <td className="p-3 text-mint">{r.download_count}</td>
                      <td className="p-3 text-right">
                        <button onClick={() => togglePin(r)} className="text-muted-foreground hover:text-mint p-2" title={r.is_featured ? "Unpin" : "Pin"}>
                          <Pin className={`h-4 w-4 ${r.is_featured ? "fill-mint text-mint" : ""}`} />
                        </button>
                        <button onClick={() => deleteResource(r)} className="text-muted-foreground hover:text-destructive p-2" title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="users" className="mt-6">
            <div className="rounded-xl border border-border/60 bg-card/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Name</th>
                    <th className="text-left p-3 hidden md:table-cell">Joined</th>
                    <th className="text-left p-3">Role</th>
                    <th className="p-3 w-40"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isAdminUser = adminIds.has(u.id);
                    return (
                      <tr key={u.id} className="border-b border-border/40 hover:bg-accent/20">
                        <td className="p-3 font-medium">{u.full_name ?? "—"}</td>
                        <td className="p-3 hidden md:table-cell text-muted-foreground">{formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}</td>
                        <td className="p-3">
                          {isAdminUser ? <span className="text-mint text-xs uppercase tracking-wider">★ Admin</span> : <span className="text-muted-foreground text-xs">User</span>}
                        </td>
                        <td className="p-3 text-right">
                          {isAdminUser ? (
                            <Button size="sm" variant="outline" onClick={() => demoteUser(u.id)} disabled={u.id === user?.id}>Remove admin</Button>
                          ) : (
                            <Button size="sm" onClick={() => promoteUser(u.id)} className="bg-gradient-primary text-primary-foreground hover:opacity-90">Make admin</Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <Footer />
    </div>
  );
}

function StatTile({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-6">
      <div className="flex items-center gap-3 text-muted-foreground text-xs uppercase tracking-wider">
        <Icon className="h-4 w-4 text-mint" /> {label}
      </div>
      <div className="mt-3 font-serif text-4xl text-gradient-primary">{value.toLocaleString()}</div>
    </div>
  );
}
