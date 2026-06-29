import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { FolderOpen, Plus, Trash2, Star } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function Folders() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const { data: folders, isLoading, refetch } = trpc.folders.list.useQuery();
  const createMutation = trpc.folders.create.useMutation({
    onSuccess: (data) => {
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      refetch();
      setLocation(`/folders/${data.id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.folders.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Folder deleted"); },
    onError: (e) => toast.error(e.message),
  });

  const isAdmin = user?.role === "admin";
  const systemFolder = folders?.find((f) => f.isSystemFolder);
  const teamFolders = folders?.filter((f) => !f.isSystemFolder) ?? [];

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-sans text-2xl font-bold uppercase tracking-tight">TEAM FOLDERS</h1>
            <p className="text-sm text-gray-500 mt-1 font-mono">
              Shared workspaces for your team's slide libraries and decks.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--color-brand)] text-black font-sans font-bold text-xs uppercase tracking-widest border border-black ds-shadow ds-hover"
          >
            <Plus size={14} />
            NEW FOLDER
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 border border-black bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* System folder — always shown first */}
            {systemFolder && (
              <div className="mb-8">
                <div className="mb-3">
                  <span className="tag-brand">SHARED LIBRARY</span>
                </div>
                <div
                  className="border-2 border-black bg-black text-white p-6 cursor-pointer ds-shadow ds-hover flex items-center justify-between"
                  onClick={() => setLocation(`/folders/${systemFolder.id}`)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[var(--color-brand)] border border-black flex items-center justify-center shrink-0">
                      <Star size={20} className="text-black" />
                    </div>
                    <div>
                      <div className="font-sans text-xl font-bold tracking-tight text-white">LIBRARY</div>
                      <div className="text-xs font-mono text-white/50 mt-0.5">
                        Official slide library — visible to all team members
                      </div>
                    </div>
                  </div>
                  <div className="text-xs font-mono text-white/40 uppercase tracking-widest">
                    {isAdmin ? "ADMIN ACCESS" : "VIEW ONLY"}
                  </div>
                </div>
              </div>
            )}

            {/* Team Folders */}
            <div>
              {teamFolders.length > 0 && (
                <div className="mb-3">
                  <span className="ds-tag">YOUR FOLDERS</span>
                </div>
              )}
              {teamFolders.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0">
                  {teamFolders.map((folder, i) => (
                    <div
                      key={folder.id}
                      className="border border-black p-5 bg-white cursor-pointer ds-hover"
                      style={{ marginTop: i >= 3 ? "-1px" : 0, marginLeft: i % 3 !== 0 ? "-1px" : 0 }}
                      onClick={() => setLocation(`/folders/${folder.id}`)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <FolderOpen size={16} className="text-black shrink-0" />
                          <span className="font-sans font-bold text-sm uppercase tracking-tight truncate">{folder.name}</span>
                        </div>
                        <button
                          className="shrink-0 p-1 text-gray-400 hover:text-red-600 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete "${folder.name}"? This cannot be undone.`)) {
                              deleteMutation.mutate({ id: folder.id });
                            }
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                      {folder.description && (
                        <p className="text-xs text-gray-500 line-clamp-2 mb-3">{folder.description}</p>
                      )}
                      <p className="text-xs font-mono text-gray-400 uppercase tracking-widest">
                        Created {new Date(folder.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              ) : !systemFolder ? (
                <div className="border border-dashed border-black p-16 text-center">
                  <FolderOpen size={32} className="text-gray-300 mx-auto mb-4" />
                  <h3 className="font-sans font-bold uppercase text-sm mb-2">NO FOLDERS YET</h3>
                  <p className="text-xs text-gray-500 font-mono mb-6 max-w-xs mx-auto">
                    Create a folder to start building a shared slide library with your team.
                  </p>
                  <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-black text-white font-sans font-bold text-xs uppercase tracking-widest border border-black ds-shadow ds-hover mx-auto"
                  >
                    <Plus size={14} />
                    CREATE FOLDER
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* Create folder modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCreate(false)} />
          <div className="relative z-10 bg-white border border-black p-8 w-full max-w-md mx-4 ds-shadow">
            <h2 className="font-sans text-lg font-bold uppercase tracking-tight mb-6">CREATE TEAM FOLDER</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-widest text-gray-500 mb-1.5">FOLDER NAME</label>
                <input
                  type="text"
                  placeholder="e.g. Investor Decks, Product Demos"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                  className="w-full border border-black px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-black"
                  onKeyDown={(e) => e.key === "Enter" && newName.trim() && createMutation.mutate({ name: newName.trim(), description: newDesc.trim() || undefined })}
                />
              </div>
              <div>
                <label className="block text-xs font-mono uppercase tracking-widest text-gray-500 mb-1.5">DESCRIPTION <span className="text-gray-300">(OPTIONAL)</span></label>
                <textarea
                  placeholder="What is this folder for?"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={2}
                  className="w-full border border-black px-3 py-2.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-black resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2.5 border border-black text-sm font-sans font-bold uppercase tracking-widest hover:bg-gray-50 transition-colors"
              >
                CANCEL
              </button>
              <button
                disabled={!newName.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate({ name: newName.trim(), description: newDesc.trim() || undefined })}
                className="flex-1 py-2.5 bg-black text-white text-sm font-sans font-bold uppercase tracking-widest disabled:opacity-50 ds-shadow ds-hover"
              >
                {createMutation.isPending ? "CREATING..." : "CREATE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
