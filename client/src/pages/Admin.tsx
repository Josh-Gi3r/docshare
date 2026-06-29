import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Shield, ShieldOff, Users } from "lucide-react";
import { toast } from "sonner";

export default function Admin() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: users, isLoading } = trpc.admin.listUsers.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const updateRole = trpc.admin.updateRole.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      toast.success("Role updated");
    },
    onError: (err) => toast.error(err.message),
  });

  if (loading) return null;

  if (!user || user.role !== "admin") {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Access denied — admin only.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto py-6 px-2">
        <div className="flex items-center gap-3 mb-6">
          <Users className="h-5 w-5" />
          <h1 className="text-xl font-semibold tracking-tight">User Management</h1>
          <Badge variant="outline" className="ml-auto">
            {users?.length ?? 0} users
          </Badge>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading users…</div>
        ) : (
          <div className="border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Docs</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Signed up</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last login</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users?.map((u, i) => (
                  <tr
                    key={u.id}
                    className={`border-b border-border last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}
                  >
                    <td className="px-4 py-3 font-medium">{u.name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={u.role === "admin" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {u.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.documentCount}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(u.lastSignedIn).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {u.id !== user.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          disabled={updateRole.isPending}
                          onClick={() =>
                            updateRole.mutate({
                              userId: u.id,
                              role: u.role === "admin" ? "user" : "admin",
                            })
                          }
                        >
                          {u.role === "admin" ? (
                            <>
                              <ShieldOff className="h-3 w-3" />
                              Demote
                            </>
                          ) : (
                            <>
                              <Shield className="h-3 w-3" />
                              Promote
                            </>
                          )}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
