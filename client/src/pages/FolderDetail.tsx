import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ChevronLeft, Plus, Trash2, UserPlus, Users, Copy,
  FileText, X, ChevronDown, ChevronRight, Search, Tag, Star, Pencil
} from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

export default function FolderDetail() {
  const { id } = useParams<{ id: string }>();
  const folderId = parseInt(id, 10);
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const [expandedDocIds, setExpandedDocIds] = useState<Set<number>>(new Set());

  // Document picker
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerTab, setPickerTab] = useState<"personal" | "shared">("personal");

  // Section management
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [editingSectionId, setEditingSectionId] = useState<number | null>(null);
  const [editingSectionName, setEditingSectionName] = useState("");

  const { data: folder, isLoading, refetch } = trpc.folders.get.useQuery({ id: folderId });
  const { data: sections, refetch: refetchSections } = trpc.folders.listSections.useQuery({ folderId }, { enabled: !isNaN(folderId) });
  const { data: allDocs } = trpc.documents.list.useQuery();
  // system folder docs for picker
  const { data: systemFolderData } = trpc.folders.list.useQuery();
  const systemFolder = systemFolderData?.find((f: any) => f.isSystemFolder);
  const { data: systemFolderDetail } = trpc.folders.get.useQuery(
    { id: systemFolder?.id ?? 0 },
    { enabled: !!systemFolder && !folder?.isSystemFolder }
  );

  const isAdmin = user?.role === "admin";
  const isSystemFolder = !!folder?.isSystemFolder;
  const canEdit = isSystemFolder ? isAdmin : folder?.ownerId === user?.id;

  const removeMemberMutation = trpc.folders.removeMember.useMutation({
    onSuccess: () => { refetch(); toast.success("Member removed"); },
    onError: (e) => toast.error(e.message),
  });
  const inviteMutation = trpc.folders.inviteMember.useMutation({
    onSuccess: (data) => {
      const link = `${window.location.origin}/join/${data.token}`;
      setInviteLink(link);
      refetch();
      toast.success("Invite link generated");
    },
    onError: (e) => toast.error(e.message),
  });
  const addDocMutation = trpc.folders.addDocument.useMutation({
    onSuccess: () => { refetch(); toast.success("Document added to folder"); },
    onError: (e) => toast.error(e.message),
  });
  const removeDocMutation = trpc.folders.removeDocument.useMutation({
    onSuccess: () => { refetch(); toast.success("Document removed from folder"); },
    onError: (e) => toast.error(e.message),
  });
  const createSectionMutation = trpc.folders.createSection.useMutation({
    onSuccess: () => { refetchSections(); setShowAddSection(false); setNewSectionName(""); toast.success("Section created"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteSectionMutation = trpc.folders.deleteSection.useMutation({
    onSuccess: () => { refetchSections(); toast.success("Section deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const renameSectionMutation = trpc.folders.renameSection.useMutation({
    onSuccess: () => { refetchSections(); setEditingSectionId(null); toast.success("Section renamed"); },
    onError: (e) => toast.error(e.message),
  });

  const toggleDocExpand = (docId: number) => {
    setExpandedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const folderDocIds = useMemo(
    () => new Set((folder?.documents ?? []).map((d: any) => d.id)),
    [folder?.documents]
  );

  const availablePersonalDocs = useMemo(() => {
    const docs = (allDocs ?? []).filter((d: any) => !folderDocIds.has(d.id) && d.status === "ready");
    if (!pickerSearch.trim()) return docs;
    return docs.filter((d: any) => d.title.toLowerCase().includes(pickerSearch.toLowerCase()));
  }, [allDocs, folderDocIds, pickerSearch]);

  const availableSharedDocs = useMemo(() => {
    const docs = (systemFolderDetail?.documents ?? []).filter((d: any) => !folderDocIds.has(d.id) && d.status === "ready");
    if (!pickerSearch.trim()) return docs;
    return docs.filter((d: any) => d.title.toLowerCase().includes(pickerSearch.toLowerCase()));
  }, [systemFolderDetail?.documents, folderDocIds, pickerSearch]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="font-mono text-xs uppercase tracking-widest text-gray-400 animate-pulse">LOADING...</div>
      </AppLayout>
    );
  }

  if (!folder) {
    return (
      <AppLayout>
        <div className="border border-black p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-gray-400">FOLDER NOT FOUND</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-6">
        <button onClick={() => setLocation("/folders")} className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-gray-500 hover:text-black transition-colors self-start">
          <ChevronLeft size={14} /> BACK
        </button>
        <div className="flex-1 border-l border-black pl-4">
          <div className="flex items-center gap-2">
            {isSystemFolder && <Star size={14} className="text-[var(--color-brand)]" />}
            <h1 className="font-sans text-lg sm:text-xl font-bold uppercase tracking-tight leading-tight">{folder.name}</h1>
            {isSystemFolder && <span className="tag-brand text-[10px]">SYSTEM</span>}
          </div>
          {folder.description && <p className="font-mono text-xs text-gray-400 mt-1">{folder.description}</p>}
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {canEdit && !isSystemFolder && (
            <button onClick={() => setShowInvite(true)} className="flex items-center gap-2 px-4 py-2 border border-black font-mono text-xs uppercase tracking-widest hover:bg-[var(--color-brand)] transition-colors">
              <UserPlus size={12} /> INVITE MEMBER
            </button>
          )}
          {isSystemFolder && !isAdmin && (
            <span className="px-3 py-2 border border-black font-mono text-xs uppercase tracking-widest text-gray-400">VIEW ONLY</span>
          )}
        </div>
      </div>

      <div className="space-y-8">
        {/* DOCUMENTS */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-mono text-xs uppercase tracking-widest text-gray-500">DOCUMENTS</h2>
            <div className="flex items-center gap-2">
              {canEdit && (
                <>
                  <button
                    onClick={() => setShowAddSection(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-black font-mono text-xs uppercase tracking-widest hover:bg-gray-100 transition-colors"
                  >
                    <Tag size={10} /> ADD SECTION
                  </button>
                  <button
                    onClick={() => setShowPicker(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-brand)] text-black font-mono text-xs uppercase tracking-widest border border-black hover:opacity-80 transition-opacity"
                  >
                    <Plus size={10} /> ADD DOCUMENT
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Section groupings */}
          {sections && sections.length > 0 && (
            <div className="mb-4 space-y-1">
              {sections.map((section: any) => (
                <div key={section.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-black">
                  {editingSectionId === section.id ? (
                    <>
                      <input
                        autoFocus
                        value={editingSectionName}
                        onChange={(e) => setEditingSectionName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && editingSectionName.trim()) {
                            renameSectionMutation.mutate({ sectionId: section.id, folderId, name: editingSectionName.trim() });
                          }
                          if (e.key === "Escape") setEditingSectionId(null);
                        }}
                        className="flex-1 font-mono text-xs border-b border-black focus:outline-none bg-transparent"
                      />
                      <button onClick={() => renameSectionMutation.mutate({ sectionId: section.id, folderId, name: editingSectionName.trim() })} className="font-mono text-xs text-[var(--color-brand)] uppercase">SAVE</button>
                      <button onClick={() => setEditingSectionId(null)} className="font-mono text-xs text-gray-400 uppercase">CANCEL</button>
                    </>
                  ) : (
                    <>
                      <span className="font-mono text-xs uppercase tracking-widest font-bold flex-1">{section.name}</span>
                      {canEdit && (
                        <>
                          <button onClick={() => { setEditingSectionId(section.id); setEditingSectionName(section.name); }} className="p-1 text-gray-400 hover:text-black transition-colors"><Pencil size={11} /></button>
                          <button onClick={() => deleteSectionMutation.mutate({ sectionId: section.id, folderId })} className="p-1 text-gray-400 hover:text-red-600 transition-colors"><Trash2 size={11} /></button>
                        </>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {(!folder.documents || folder.documents.length === 0) ? (
            <div className="border border-dashed border-black p-8 text-center bg-gray-50">
              <FileText size={24} className="mx-auto mb-3 text-gray-300" />
              <p className="font-mono text-xs uppercase tracking-widest text-gray-400 mb-1">NO DOCUMENTS YET</p>
              {canEdit && (
                <p className="font-mono text-xs text-gray-300">Click ADD DOCUMENT to add a document to this folder.</p>
              )}
            </div>
          ) : (
            <div className="border border-black">
              {folder.documents.map((doc: any) => {
                const isExpanded = expandedDocIds.has(doc.id);
                const subDecks: any[] = doc.subDecks ?? [];
                return (
                  <div key={doc.id} className="border-b border-black last:border-b-0">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button
                        onClick={() => toggleDocExpand(doc.id)}
                        className={`w-5 h-5 flex items-center justify-center border border-black flex-shrink-0 transition-colors ${subDecks.length > 0 ? "hover:bg-[var(--color-brand)]" : "opacity-30 cursor-default"}`}
                        disabled={subDecks.length === 0}
                      >
                        {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                      </button>
                      <FileText size={14} className="text-gray-400 flex-shrink-0" />
                      <button
                        onClick={() => setLocation(`/doc/${doc.id}`)}
                        className="flex-1 min-w-0 text-left hover:underline"
                      >
                        <div className="font-mono text-xs font-bold uppercase truncate">{doc.title}</div>
                        <div className="font-mono text-xs text-gray-400">
                          {doc.pages?.length ?? 0} SLIDES
                          {subDecks.length > 0 && (
                            <span className="ml-2 text-gray-300">· {subDecks.length} SUB{subDecks.length !== 1 ? "S" : ""}</span>
                          )}
                        </div>
                      </button>
                      <span className={`font-mono text-xs uppercase flex-shrink-0 ${doc.status === "ready" ? "text-[var(--color-brand)]" : "text-orange-500"}`}>{doc.status}</span>
                      {canEdit && (
                        <button
                          onClick={() => {
                            if (confirm(`Remove "${doc.title}" from this folder?`)) {
                              removeDocMutation.mutate({ folderId, documentId: doc.id });
                            }
                          }}
                          className="p-1.5 border border-black hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors flex-shrink-0"
                          title="Remove from folder"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>

                    {isExpanded && subDecks.length > 0 && (
                      <div className="border-t border-black bg-gray-50">
                        {subDecks.map((sub: any) => (
                          <button
                            key={sub.id}
                            onClick={() => setLocation(`/doc/${doc.id}?tab=${sub.id}`)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-black last:border-b-0 hover:bg-[var(--color-brand)]/10 transition-colors text-left"
                          >
                            <div className="w-5 flex-shrink-0 flex items-center justify-center">
                              <div className="w-px h-4 bg-gray-300" />
                            </div>
                            <div className="w-1.5 h-1.5 bg-gray-400 flex-shrink-0" />
                            <span className="font-mono text-xs uppercase tracking-widest text-gray-600 flex-1 truncate">{sub.name}</span>
                            <span className="font-mono text-[10px] text-gray-400 uppercase tracking-widest flex-shrink-0">
                              {new Date(sub.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* TEAM MEMBERS — hidden for system folder */}
        {!isSystemFolder && folder.members && folder.members.length > 0 && (
          <div>
            <h2 className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
              <Users size={12} /> TEAM MEMBERS
            </h2>
            <div className="border border-black">
              {folder.members.map((m: any) => (
                <div key={m.id} className="flex items-center gap-4 px-4 py-3 border-b border-black last:border-b-0">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs font-bold uppercase">{m.name || m.email}</div>
                    <div className="font-mono text-xs text-gray-400">{m.email}</div>
                  </div>
                  <span className="px-2 py-0.5 border border-black font-mono text-xs uppercase">{m.role}</span>
                  {canEdit && (
                    <button onClick={() => removeMemberMutation.mutate({ folderId, memberId: m.id })} className="p-1.5 border border-black hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Section Modal */}
      {showAddSection && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-black w-full max-w-sm p-6 ds-shadow">
            <h2 className="font-sans font-bold text-sm uppercase tracking-tight mb-4">ADD SECTION</h2>
            <input
              autoFocus
              type="text"
              placeholder="Section name (e.g. Q1 Decks)"
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newSectionName.trim() && createSectionMutation.mutate({ folderId, name: newSectionName.trim() })}
              className="w-full border border-black px-3 py-2.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-black mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowAddSection(false)} className="flex-1 py-2.5 border border-black font-mono text-xs uppercase tracking-widest hover:bg-gray-100 transition-colors">CANCEL</button>
              <button
                disabled={!newSectionName.trim() || createSectionMutation.isPending}
                onClick={() => createSectionMutation.mutate({ folderId, name: newSectionName.trim() })}
                className="flex-1 py-2.5 bg-black text-white font-mono text-xs uppercase tracking-widest disabled:opacity-50"
              >
                {createSectionMutation.isPending ? "CREATING..." : "CREATE"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Document Picker Modal */}
      {showPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-black w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black flex-shrink-0">
              <h2 className="font-sans font-bold text-sm uppercase tracking-tight">ADD DOCUMENT TO FOLDER</h2>
              <button onClick={() => { setShowPicker(false); setPickerSearch(""); }} className="p-1.5 hover:bg-gray-100 transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Tabs: Personal / Library */}
            {systemFolderDetail && !isSystemFolder && (
              <div className="flex border-b border-black flex-shrink-0">
                <button
                  onClick={() => setPickerTab("personal")}
                  className={`flex-1 py-2.5 font-mono text-xs uppercase tracking-widest transition-colors ${pickerTab === "personal" ? "bg-black text-white" : "hover:bg-gray-50"}`}
                >
                  MY DOCUMENTS
                </button>
                <button
                  onClick={() => setPickerTab("shared")}
                  className={`flex-1 py-2.5 font-mono text-xs uppercase tracking-widest transition-colors ${pickerTab === "shared" ? "bg-black text-white" : "hover:bg-gray-50"}`}
                >
                  FROM LIBRARY
                </button>
              </div>
            )}

            <div className="px-5 py-3 border-b border-black flex-shrink-0">
              <div className="flex items-center gap-2 border border-black px-3 py-2">
                <Search size={12} className="text-gray-400 flex-shrink-0" />
                <input
                  autoFocus
                  type="text"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Search documents..."
                  className="flex-1 font-mono text-xs focus:outline-none bg-transparent placeholder-gray-400"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {(() => {
                const docs = pickerTab === "shared" ? availableSharedDocs : availablePersonalDocs;
                if (docs.length === 0) {
                  return (
                    <div className="p-8 text-center">
                      <p className="font-mono text-xs uppercase tracking-widest text-gray-400">
                        {pickerSearch.trim() ? "NO MATCHING DOCUMENTS" : "NO DOCUMENTS AVAILABLE"}
                      </p>
                    </div>
                  );
                }
                return (
                  <div className="divide-y divide-black/10">
                    {docs.map((doc: any) => (
                      <button
                        key={doc.id}
                        onClick={() => {
                          addDocMutation.mutate({ folderId, documentId: doc.id });
                          setShowPicker(false);
                          setPickerSearch("");
                        }}
                        disabled={addDocMutation.isPending}
                        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-brand)]/10 transition-colors text-left disabled:opacity-50"
                      >
                        <FileText size={14} className="text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-xs font-bold uppercase truncate">{doc.title}</div>
                          <div className="font-mono text-xs text-gray-400">{(doc.pages?.length ?? doc.pageCount ?? 0)} SLIDES · {doc.fileType?.toUpperCase()}</div>
                        </div>
                        <Plus size={12} className="text-gray-400 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <InviteModal folderId={folderId} inviteEmail={inviteEmail} setInviteEmail={setInviteEmail}
          inviteName={inviteName} setInviteName={setInviteName} inviteRole={inviteRole} setInviteRole={setInviteRole}
          inviteLink={inviteLink} setInviteLink={setInviteLink} inviteMutation={inviteMutation}
          onClose={() => { setShowInvite(false); setInviteLink(null); setInviteEmail(""); setInviteName(""); }} />
      )}
    </AppLayout>
  );
}

function InviteModal({
  folderId, inviteEmail, setInviteEmail, inviteName, setInviteName,
  inviteRole, setInviteRole, inviteLink, setInviteLink, inviteMutation, onClose,
}: {
  folderId: number;
  inviteEmail: string; setInviteEmail: (v: string) => void;
  inviteName: string; setInviteName: (v: string) => void;
  inviteRole: "editor" | "viewer"; setInviteRole: (v: "editor" | "viewer") => void;
  inviteLink: string | null; setInviteLink: (v: string | null) => void;
  inviteMutation: any;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-black w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black">
          <h2 className="font-sans font-bold text-sm uppercase tracking-tight">INVITE TEAM MEMBER</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 transition-colors"><X size={14} /></button>
        </div>
        <div className="p-5">
          {inviteLink ? (
            <div className="space-y-3">
              <p className="font-mono text-xs text-gray-500 uppercase tracking-widest">SHARE THIS LINK WITH YOUR TEAM MEMBER</p>
              <div className="flex items-center gap-0">
                <input value={inviteLink} readOnly className="flex-1 border border-black px-3 py-2 font-mono text-xs focus:outline-none bg-gray-50" />
                <button onClick={() => { navigator.clipboard.writeText(inviteLink); toast.success("Copied!"); }} className="p-2 border border-black border-l-0 hover:bg-[var(--color-brand)] transition-colors">
                  <Copy size={14} />
                </button>
              </div>
              <button onClick={onClose} className="w-full py-3 bg-black text-white font-mono text-xs uppercase tracking-widest border border-black">DONE</button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block font-mono text-xs uppercase tracking-widest text-gray-500 mb-1.5">EMAIL</label>
                <input type="email" placeholder="team@docshare.example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full border border-black px-3 py-2 font-mono text-xs focus:outline-none focus:border-[var(--color-brand)]" />
              </div>
              <div>
                <label className="block font-mono text-xs uppercase tracking-widest text-gray-500 mb-1.5">NAME <span className="text-gray-300">(OPTIONAL)</span></label>
                <input placeholder="Their name" value={inviteName} onChange={(e) => setInviteName(e.target.value)}
                  className="w-full border border-black px-3 py-2 font-mono text-xs focus:outline-none focus:border-[var(--color-brand)]" />
              </div>
              <div>
                <label className="block font-mono text-xs uppercase tracking-widest text-gray-500 mb-1.5">ROLE</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "editor" | "viewer")}
                  className="w-full border border-black px-3 py-2 font-mono text-xs focus:outline-none focus:border-[var(--color-brand)] bg-white">
                  <option value="editor">Editor — can build decks</option>
                  <option value="viewer">Viewer — read only</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={onClose} className="flex-1 py-3 border border-black font-mono text-xs uppercase tracking-widest hover:bg-gray-100 transition-colors">CANCEL</button>
                <button disabled={!inviteEmail.trim() || inviteMutation.isPending}
                  onClick={() => inviteMutation.mutate({ folderId, email: inviteEmail.trim(), name: inviteName.trim() || undefined, role: inviteRole })}
                  className="flex-1 py-3 bg-[var(--color-brand)] text-black font-mono text-xs uppercase tracking-widest border border-black disabled:opacity-50">
                  {inviteMutation.isPending ? "GENERATING..." : "GENERATE INVITE LINK"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
