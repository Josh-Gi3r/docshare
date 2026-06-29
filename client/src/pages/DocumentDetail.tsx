import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { getShareBaseUrl } from "@/lib/baseUrl";
import { useParams, useLocation, useSearch } from "wouter";
import { useState, useRef } from "react";
import {
  Link2, Eye, Users, Clock, Plus, Trash2, Copy, ExternalLink,
  Lock, Calendar, ToggleLeft, ToggleRight, Image, ChevronLeft, BarChart2,
  Tag, Layers, History, RotateCcw, GripVertical, EyeOff, Upload, X,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import NarrationPanel from "@/components/NarrationPanel";
import VideoSlidePanel from "@/components/VideoSlidePanel";

// ── Drag-to-reorder slide row ──────────────────────────────────────────────
type SlideRow = { pageNumber: number; hidden: boolean };

function SlideManager({
  pages,
  slideConfig,
  onSave,
  onReset,
  isSaving,
}: {
  pages: Array<{ id: number; pageNumber: number; thumbnailUrl: string }>;
  slideConfig: SlideRow[] | null;
  onSave: (config: SlideRow[]) => void;
  onReset: () => void;
  isSaving: boolean;
}) {
  const buildDefault = (): SlideRow[] =>
    pages.map((p) => ({ pageNumber: p.pageNumber, hidden: false }));

  const buildFromConfig = (cfg: SlideRow[]): SlideRow[] => {
    const inConfig = cfg.map((c) => c.pageNumber);
    const extras = pages
      .filter((p) => !inConfig.includes(p.pageNumber))
      .map((p) => ({ pageNumber: p.pageNumber, hidden: false }));
    return [...cfg, ...extras];
  };

  const [rows, setRows] = useState<SlideRow[]>(() =>
    slideConfig && slideConfig.length > 0 ? buildFromConfig(slideConfig) : buildDefault()
  );
  const dragIdx = useRef<number | null>(null);

  const thumbFor = (pageNumber: number) =>
    pages.find((p) => p.pageNumber === pageNumber)?.thumbnailUrl || "";

  const toggleHidden = (idx: number) => {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, hidden: !r.hidden } : r))
    );
  };

  const onDragStart = (idx: number) => { dragIdx.current = idx; };
  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    setRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx.current!, 1);
      next.splice(idx, 0, moved);
      dragIdx.current = idx;
      return next;
    });
  };
  const onDragEnd = () => { dragIdx.current = null; };

  const visibleCount = rows.filter((r) => !r.hidden).length;

  return (
    <div className="mt-3 border border-black">
      <div className="flex items-center justify-between px-3 py-2 border-b border-black bg-gray-50">
        <span className="font-mono text-xs uppercase tracking-widest text-gray-500 flex items-center gap-1">
          <Layers size={10} /> SLIDE ORDER &amp; VISIBILITY
        </span>
        <span className="font-mono text-xs text-gray-400">{visibleCount}/{rows.length} VISIBLE</span>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {rows.map((row, idx) => (
          <div
            key={row.pageNumber}
            draggable
            onDragStart={() => onDragStart(idx)}
            onDragOver={(e) => onDragOver(e, idx)}
            onDragEnd={onDragEnd}
            className={`flex items-center gap-2 px-3 py-1.5 border-b border-black last:border-b-0 cursor-grab active:cursor-grabbing ${
              row.hidden ? "opacity-40 bg-gray-50" : "bg-white"
            }`}
          >
            <GripVertical size={12} className="text-gray-300 flex-shrink-0" />
            <img
              src={thumbFor(row.pageNumber)}
              alt={`Slide ${idx + 1}`}
              className="w-10 border border-black flex-shrink-0"
              style={{ aspectRatio: "16/9" }}
            />
            <span className="font-mono text-xs text-gray-500 flex-1">
              SLIDE {idx + 1}
              {row.pageNumber !== idx + 1 && (
                <span className="text-gray-300 ml-1">(orig. {row.pageNumber})</span>
              )}
            </span>
            <button
              onClick={() => toggleHidden(idx)}
              className={`p-1 border border-black transition-colors ${
                row.hidden ? "bg-gray-200 hover:bg-[var(--color-brand)]" : "hover:bg-gray-100"
              }`}
              title={row.hidden ? "Show slide" : "Hide slide"}
            >
              <EyeOff size={10} className={row.hidden ? "text-gray-400" : "text-black"} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 border-t border-black bg-gray-50">
        <button
          onClick={() => onSave(rows)}
          disabled={isSaving}
          className="flex-1 py-1.5 bg-[var(--color-brand)] border border-black font-mono text-xs uppercase tracking-widest text-black disabled:opacity-50"
        >
          {isSaving ? "SAVING..." : "SAVE CONFIG"}
        </button>
        <button
          onClick={() => { setRows(buildDefault()); onReset(); }}
          className="px-3 py-1.5 border border-black font-mono text-xs uppercase tracking-widest hover:bg-gray-100 flex items-center gap-1"
        >
          <RotateCcw size={10} /> RESET
        </button>
      </div>
    </div>
  );
}

// ── Version History Panel ──────────────────────────────────────────────────
function VersionHistory({
  documentId,
  currentVersion,
  onVersionUploaded,
}: {
  documentId: number;
  currentVersion: number;
  onVersionUploaded: () => void;
}) {
  const { data: versions, refetch } = trpc.versions.list.useQuery({ documentId });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // After a successful upload, store the new version id to prompt narration copy-forward
  const [newVersionId, setNewVersionId] = useState<number | null>(null);
  const copyNarrations = trpc.narrations.copyFromMaster.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.copied} narration${result.copied === 1 ? "" : "s"} copied to new version`);
      setNewVersionId(null);
    },
    onError: () => toast.error("Failed to copy narrations"),
  });

  const handleVersionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentId", String(documentId));
      const res = await fetch("/api/upload-version", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      toast.success(`Version ${data.versionNumber} uploading — thumbnails generating...`);
      // Prompt to copy narrations once the new version row id is known
      if (data.versionId) setNewVersionId(data.versionId);
      refetch();
      onVersionUploaded();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="mt-6">
      {/* Narration copy-forward prompt — shown after a new version is uploaded */}
      {newVersionId && (
        <div className="mb-3 border border-orange-400 bg-orange-50 px-4 py-3 flex items-center justify-between gap-4">
          <p className="font-mono text-xs text-orange-700 uppercase tracking-widest">
            Copy master narrations to this version?
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => copyNarrations.mutate({ documentId, targetVersionId: newVersionId })}
              disabled={copyNarrations.isPending}
              className="px-3 py-1 border border-orange-400 bg-orange-400 text-white font-mono text-xs uppercase tracking-widest hover:bg-orange-500 transition-colors disabled:opacity-50"
            >
              {copyNarrations.isPending ? "COPYING..." : "COPY"}
            </button>
            <button
              onClick={() => setNewVersionId(null)}
              className="px-3 py-1 border border-orange-400 text-orange-600 font-mono text-xs uppercase tracking-widest hover:bg-orange-100 transition-colors"
            >
              SKIP
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-gray-500 flex items-center gap-2">
          <History size={12} /> VERSION HISTORY
        </h2>
        <label className={`flex items-center gap-2 px-3 py-1.5 border border-black font-mono text-xs uppercase tracking-widest cursor-pointer ${
          uploading ? "opacity-50 cursor-not-allowed" : "hover:bg-[var(--color-brand)] transition-colors"
        }`}>
          <Upload size={10} />
          {uploading ? "UPLOADING..." : "UPLOAD NEW VERSION"}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.pptx,.ppt"
            className="hidden"
            disabled={uploading}
            onChange={handleVersionUpload}
          />
        </label>
      </div>
      <div className="border border-black">
        {!versions || versions.length === 0 ? (
          <div className="p-6 text-center">
            <p className="font-mono text-xs text-gray-400 uppercase">ONLY ONE VERSION — UPLOAD A NEW ONE ABOVE</p>
          </div>
        ) : (
          versions.map((v) => (
            <div
              key={v.id}
              className={`flex items-center gap-4 px-4 py-3 border-b border-black last:border-b-0 ${
                v.versionNumber === currentVersion ? "bg-[var(--color-brand)]/10" : "bg-white"
              }`}
            >
              <div className="flex-shrink-0">
                <div className={`w-8 h-8 border border-black flex items-center justify-center font-mono text-xs font-bold ${
                  v.versionNumber === currentVersion ? "bg-[var(--color-brand)] text-black" : "bg-white text-gray-500"
                }`}>
                  V{v.versionNumber}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs text-gray-600 truncate">{v.fileName}</div>
                <div className="font-mono text-xs text-gray-400 mt-0.5">
                  {v.pageCount} PAGES · {v.fileType.toUpperCase()} ·{" "}
                  {new Date(v.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-mono text-xs uppercase px-2 py-0.5 border border-black ${
                  v.status === "ready"
                    ? v.versionNumber === currentVersion
                      ? "bg-[var(--color-brand)] text-black border-[var(--color-brand)]"
                      : "text-gray-500"
                    : v.status === "processing"
                    ? "text-orange-500"
                    : "text-red-500"
                }`}>
                  {v.versionNumber === currentVersion && v.status === "ready" ? "CURRENT" : v.status.toUpperCase()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Main DocumentDetail ────────────────────────────────────────────────────
export default function DocumentDetail() {
  const params = useParams<{ id: string }>();
  const docId = parseInt(params.id);
  const [, navigate] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const tabParam = searchParams.get("tab");

  const { data: doc, isLoading, refetch } = trpc.documents.get.useQuery({ id: docId });
  const { data: links, refetch: refetchLinks } = trpc.shareLinks.list.useQuery({ documentId: docId });
  const { data: analytics } = trpc.analytics.documentStats.useQuery({ documentId: docId });
  // Fetch versions to resolve the active version's DB row id (needed for narration scoping)
  const { data: docVersions } = trpc.versions.list.useQuery({ documentId: docId }, { enabled: !!doc });
  // activeVersionId: null = master (original upload); number = DB id of the active version row
  const activeVersionId = (() => {
    if (!doc || !docVersions) return null;
    if (!doc.currentVersion || doc.currentVersion <= 1) return null; // master
    const active = docVersions.find((v: any) => v.versionNumber === doc.currentVersion && v.status === "ready");
    return active?.id ?? null;
  })();

  // Sub-deck tabs
  const { data: subDecks, refetch: refetchSubDecks } = trpc.subDecks.list.useQuery({ documentId: docId });
  // activeSubDeckId: null = MASTER tab, number = a sub-deck tab
  const [activeSubDeckId, setActiveSubDeckId] = useState<number | null>(
    tabParam ? parseInt(tabParam, 10) : null
  );
  const [showNewSubDeckForm, setShowNewSubDeckForm] = useState(false);
  const [newSubDeckName, setNewSubDeckName] = useState("");

  // Sub-deck stats — only fetched when a sub-deck tab is active
  const { data: subDeckStats } = trpc.analytics.subDeckStats.useQuery(
    { subDeckId: activeSubDeckId ?? 0, documentId: docId },
    { enabled: activeSubDeckId !== null }
  );

  // Active stats: use sub-deck stats when on a sub-deck tab, document stats on MASTER
  const activeStats = activeSubDeckId !== null ? subDeckStats : analytics;

  // Visible share links: filter by active tab
  // MASTER tab: links with no subDeckId (null/undefined)
  // Sub-deck tab: links belonging to that sub-deck
  const visibleLinks = (links ?? []).filter((l: any) => {
    if (activeSubDeckId === null) {
      return l.subDeckId == null;
    }
    return l.subDeckId === activeSubDeckId;
  });

  // Derive the page order/visibility for the left strip from the first visible link's slideConfig.
  // Also compute: which link is driving the view, and whether multiple links have conflicting configs.
  const stripLinkInfo = (() => {
    const rawPages = doc?.pages ?? [];
    const configuredLinks = visibleLinks.filter((l: any) =>
      l.slideConfig && Array.isArray(l.slideConfig) && l.slideConfig.length > 0
    );
    const activeLink = configuredLinks[0] ?? null;
    const activeConfig = activeLink?.slideConfig as Array<{ pageNumber: number; hidden: boolean }> | undefined;
    // Conflict: more than one link has a slideConfig and they differ
    const hasConflict = configuredLinks.length > 1 && configuredLinks.some((l: any) =>
      JSON.stringify(l.slideConfig) !== JSON.stringify(configuredLinks[0].slideConfig)
    );
    if (!activeConfig) return { pages: rawPages, activeLink: null, hasConflict: false };
    const ordered = activeConfig
      .filter((c) => !c.hidden)
      .map((c) => rawPages.find((p: any) => p.pageNumber === c.pageNumber))
      .filter(Boolean) as typeof rawPages;
    return {
      pages: ordered.length > 0 ? ordered : rawPages,
      activeLink,
      hasConflict,
    };
  })();
  const displayPages = stripLinkInfo.pages;
  const stripActiveLink = stripLinkInfo.activeLink as any;
  const stripHasConflict = stripLinkInfo.hasConflict;

  const createSubDeck = trpc.subDecks.create.useMutation({
    onSuccess: (data) => {
      toast.success("Deck created");
      setNewSubDeckName("");
      setShowNewSubDeckForm(false);
      refetchSubDecks();
      setActiveSubDeckId(data.id);
    },
    onError: () => toast.error("Failed to create deck"),
  });

  const deleteSubDeck = trpc.subDecks.delete.useMutation({
    onSuccess: () => {
      toast.success("Deck deleted");
      setActiveSubDeckId(null);
      refetchSubDecks();
    },
    onError: () => toast.error("Failed to delete deck"),
  });

  const reprocessDoc = trpc.documents.reprocess.useMutation({
    onSuccess: () => { toast.success("Reprocessing started"); refetch(); },
    onError: () => toast.error("Failed to start reprocessing"),
  });

  const createLink = trpc.shareLinks.create.useMutation({
    onSuccess: () => { toast.success("Share link created"); refetchLinks(); },
    onError: () => toast.error("Failed to create link"),
  });

  const updateLink = trpc.shareLinks.update.useMutation({
    onSuccess: () => { refetchLinks(); },
    onError: () => toast.error("Failed to update link"),
  });

  const deleteLink = trpc.shareLinks.delete.useMutation({
    onSuccess: () => { toast.success("Link deleted"); refetchLinks(); },
    onError: () => toast.error("Failed to delete link"),
  });

  const updateSlug = trpc.shareLinks.updateSlug.useMutation({
    onSuccess: (data) => {
      toast.success(`URL updated to /view/${data.slug}`);
      setEditingSlugId(null);
      setSlugError("");
      refetchLinks();
    },
    onError: (err) => setSlugError(err.message || "Slug already taken"),
  });

  // UI state
  const [showOgChooser, setShowOgChooser] = useState<number | null>(null);
  const [editingLinkId, setEditingLinkId] = useState<number | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [editingSlugId, setEditingSlugId] = useState<number | null>(null);
  const [editSlugValue, setEditSlugValue] = useState("");
  const [slugError, setSlugError] = useState("");
  const [editingLabelId, setEditingLabelId] = useState<number | null>(null);
  const [editLabelValue, setEditLabelValue] = useState("");
  const [expandedSlideManager, setExpandedSlideManager] = useState<number | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [ogDrafts, setOgDrafts] = useState<Record<number, { title: string; description: string; saved: boolean }>>({})

  // ── Slide tags (PRESENT) ────────────────────────────────────────────────────────────
  const { data: slideTags, refetch: refetchSlideTags } = trpc.slideTags.list.useQuery(
    { documentId: docId },
    { enabled: !isNaN(docId) }
  );
  const toggleSlideTag = trpc.slideTags.toggle.useMutation({
    onSuccess: () => refetchSlideTags(),
  });
  const isPresent = (pageId: number) =>
    (slideTags ?? []).some((t) => t.documentPageId === pageId && t.tag === "present");;

  const getOgDraft = (link: { id: number; ogTitle?: string | null; ogDescription?: string | null }) => {
    if (ogDrafts[link.id]) return ogDrafts[link.id];
    return { title: (link as any).ogTitle || "", description: (link as any).ogDescription || "", saved: true };
  };

  const setOgTitle = (linkId: number, title: string) =>
    setOgDrafts(prev => ({ ...prev, [linkId]: { ...getOgDraft({ id: linkId }), title, saved: false } }));

  const setOgDescription = (linkId: number, description: string) =>
    setOgDrafts(prev => ({ ...prev, [linkId]: { ...getOgDraft({ id: linkId }), description, saved: false } }));

  const saveOgMeta = (link: { id: number; ogTitle?: string | null; ogDescription?: string | null }) => {
    const draft = getOgDraft(link);
    updateLink.mutate(
      { id: link.id, ogTitle: draft.title.trim() || null, ogDescription: draft.description.trim() || null },
      {
        onSuccess: () => {
          setOgDrafts(prev => ({ ...prev, [link.id]: { ...draft, saved: true } }));
          toast.success("Preview metadata saved");
        },
      }
    );
  };

  const baseUrl = getShareBaseUrl();

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`${baseUrl}/view/${slug}`);
    toast.success("Link copied");
  };

  if (isLoading) {
    return (
      <AppLayout title="DOCUMENT">
        <div className="font-mono text-xs uppercase tracking-widest text-gray-400 animate-pulse">LOADING...</div>
      </AppLayout>
    );
  }

  if (!doc) {
    return (
      <AppLayout title="DOCUMENT">
        <div className="border border-black p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-gray-400">DOCUMENT NOT FOUND</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Back + Title bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-6">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-gray-500 hover:text-black transition-colors self-start"
        >
          <ChevronLeft size={14} />
          BACK
        </button>
        <div className="flex-1 border-l border-black pl-4">
          <h1 className="font-sans text-lg sm:text-xl font-bold uppercase tracking-tight leading-tight">{doc.title}</h1>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1">
            <span className="ds-tag">{doc.fileType.toUpperCase()}</span>
            <span className="font-mono text-xs text-gray-400">{doc.pageCount} PAGES</span>
            <span className={`font-mono text-xs ${doc.status === "ready" ? "text-[var(--color-brand)]" : doc.status === "error" ? "text-red-500" : "text-orange-500"} uppercase`}>
              {doc.status}
            </span>
            <span className="font-mono text-xs text-gray-400">V{doc.currentVersion ?? 1}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {doc.status === "error" && (
            <button
              onClick={() => reprocessDoc.mutate({ id: docId })}
              disabled={reprocessDoc.isPending}
              className="flex items-center gap-2 px-3 py-2 border border-black font-mono text-xs uppercase tracking-widest hover:bg-orange-50 hover:border-orange-500 hover:text-orange-600 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} />
              REPROCESS
            </button>
          )}
          {/* Delete sub-deck button — only shown when a sub-deck tab is active */}
          {activeSubDeckId !== null && (
            <button
              onClick={() => { if (confirm("Delete this version? This cannot be undone.")) deleteSubDeck.mutate({ id: activeSubDeckId }); }}
              disabled={deleteSubDeck.isPending}
              className="flex items-center gap-2 px-3 py-2 border border-black font-mono text-xs uppercase tracking-widest hover:bg-red-50 hover:border-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
            >
              <Trash2 size={12} />
              DELETE VERSION
            </button>
          )}
          <button
            onClick={() => setShowVersionHistory(!showVersionHistory)}
            className={`flex items-center gap-2 px-3 py-2 border border-black font-mono text-xs uppercase tracking-widest transition-colors ${
              showVersionHistory ? "bg-black text-white" : "hover:bg-gray-100"
            }`}
          >
            <History size={12} />
            VERSIONS
          </button>
        </div>
      </div>

      {/* Sub-deck tab bar — MASTER + sub-decks in creation order + NEW TAB */}
      <div className="flex items-end gap-0 mb-6 border-b border-black overflow-x-auto">
        <div className="flex items-end gap-0 min-w-0 overflow-x-auto">
          {/* MASTER tab */}
          <button
            onClick={() => setActiveSubDeckId(null)}
            className={`px-4 py-2.5 font-mono text-xs uppercase tracking-widest whitespace-nowrap border border-b-0 transition-colors flex-shrink-0 flex items-center gap-2 ${
              activeSubDeckId === null
                ? "bg-white border-black text-black -mb-px"
                : "bg-gray-50 border-transparent text-gray-400 hover:text-black hover:bg-gray-100"
            }`}
          >
            {doc.title.length > 20 ? doc.title.slice(0, 20) + "…" : doc.title}
            <span className="px-1 py-0.5 bg-black text-white font-mono text-[9px] uppercase tracking-widest leading-none">MASTER</span>
          </button>
          {/* Sub-deck tabs */}
          {(subDecks ?? []).map((sub: any) => (
            <button
              key={sub.id}
              onClick={() => setActiveSubDeckId(sub.id)}
              className={`px-4 py-2.5 font-mono text-xs uppercase tracking-widest whitespace-nowrap border border-b-0 transition-colors flex-shrink-0 flex items-center gap-2 ${
                activeSubDeckId === sub.id
                  ? "bg-white border-black text-black -mb-px"
                  : "bg-gray-50 border-transparent text-gray-400 hover:text-black hover:bg-gray-100"
              }`}
            >
              {sub.name.length > 22 ? sub.name.slice(0, 22) + "…" : sub.name}
            </button>
          ))}
          {/* + NEW VERSION sits immediately after the last sub-deck tab */}
          {showNewSubDeckForm ? (
            <div className="flex items-center gap-1 px-2 py-1.5 border border-b-0 border-black bg-white -mb-px flex-shrink-0">
              <input
                autoFocus
                type="text"
                value={newSubDeckName}
                onChange={(e) => setNewSubDeckName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newSubDeckName.trim()) createSubDeck.mutate({ documentId: docId, name: newSubDeckName.trim() });
                  if (e.key === "Escape") { setShowNewSubDeckForm(false); setNewSubDeckName(""); }
                }}
                className="border border-black px-2 py-1 font-mono text-xs focus:outline-none focus:border-[var(--color-brand)] w-36"
                placeholder="Version name..."
              />
              <button
                disabled={!newSubDeckName.trim() || createSubDeck.isPending}
                onClick={() => createSubDeck.mutate({ documentId: docId, name: newSubDeckName.trim() })}
                className="p-1 bg-[var(--color-brand)] border border-black font-mono text-xs disabled:opacity-50"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
              <button onClick={() => { setShowNewSubDeckForm(false); setNewSubDeckName(""); }} className="p-1 border border-black hover:bg-gray-100">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewSubDeckForm(true)}
              className="px-3 py-2.5 font-mono text-xs uppercase tracking-widest text-gray-400 hover:text-black hover:bg-gray-100 flex items-center gap-1 flex-shrink-0"
            >
              <Plus size={10} /> NEW VERSION
            </button>
          )}
        </div>
      </div>

      {/* Version history panel (collapsible) */}
      {showVersionHistory && (
        <VersionHistory
          documentId={docId}
          currentVersion={doc.currentVersion ?? 1}
          onVersionUploaded={() => refetch()}
        />
      )}

      {/* Analytics stats — scoped to active tab */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 mb-8 mt-6">
        {[
          { label: "TOTAL VIEWS", value: activeStats?.totalViews ?? 0, icon: Eye },
          { label: "UNIQUE VISITORS", value: activeStats?.uniqueVisitors ?? 0, icon: Users },
          { label: "AVG. TIME", value: activeStats?.totalTimeSpent ? `${Math.round(activeStats.totalTimeSpent)}s` : "—", icon: Clock },
          { label: "ACTIVE LINKS", value: visibleLinks.filter((l: any) => l.isEnabled).length, icon: Link2 },
        ].map(({ label, value, icon: Icon }, i) => (
          <div key={label} className="border border-black p-5 bg-white" style={{ marginLeft: i > 0 ? "-1px" : 0 }}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-xs uppercase tracking-widest text-gray-500">{label}</span>
              <Icon size={13} className="text-gray-400" />
            </div>
            <div className="font-sans text-3xl font-bold">{value}</div>
          </div>
        ))}
      </div>

      {/* Main 5-col grid: thumbnails left, share links right — same for ALL tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Thumbnails */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-xs uppercase tracking-widest text-gray-500">PAGES</h2>
              {stripActiveLink && (
                <span className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-black bg-[var(--color-brand)]/20 text-black">
                  {stripActiveLink.label ? stripActiveLink.label : stripActiveLink.slug}
                </span>
              )}
              {stripHasConflict && (
                <span
                  className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-orange-400 bg-orange-50 text-orange-600"
                  title="Multiple share links have different slide configs. Showing the first link's config."
                >
                  CONFLICT
                </span>
              )}
            </div>
            <span className="font-mono text-xs text-gray-400">{displayPages.length} SLIDES</span>
          </div>
          <div className="border border-black overflow-hidden max-h-[600px] overflow-y-auto">
            {displayPages.length > 0 ? (
              displayPages.map((page, idx) => (
                <div key={page.id} className="relative group border-b border-black last:border-b-0">
                  <img
                    src={page.thumbnailUrl}
                    alt={`Page ${page.pageNumber}`}
                    className="w-full object-cover"
                    style={{ aspectRatio: "16/9" }}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                    {showOgChooser !== null && (
                      <button
                        onClick={() => {
                          updateLink.mutate({ id: showOgChooser, ogPreviewPageNumber: page.pageNumber });
                          setShowOgChooser(null);
                          toast.success(`Preview set to page ${page.pageNumber}`);
                        }}
                        className="px-3 py-1.5 bg-[var(--color-brand)] text-black font-mono text-xs uppercase tracking-widest border border-black"
                      >
                        SET AS PREVIEW
                      </button>
                    )}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 flex items-center justify-between">
                    <span className="font-mono text-xs text-white">
                      SLIDE {idx + 1}
                      {page.pageNumber !== idx + 1 && (
                        <span className="text-white/40 ml-1">(orig. {page.pageNumber})</span>
                      )}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {/* Analytics keyed by original pageNumber so heatmap aligns with recorded views */}
                      {analytics?.pageStats?.find(p => p.pageNumber === page.pageNumber) && (
                        <span className="font-mono text-xs text-[var(--color-brand)]">
                          {analytics.pageStats.find(p => p.pageNumber === page.pageNumber)?.views}v
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSlideTag.mutate({ documentId: docId, documentPageId: page.id, tag: "present" });
                        }}
                        title={isPresent(page.id) ? "Remove PRESENT tag" : "Tag as PRESENT"}
                        className={`font-mono text-[9px] px-1.5 py-0.5 border transition-colors ${
                          isPresent(page.id)
                            ? "bg-[var(--color-brand)] text-black border-[var(--color-brand)]"
                            : "bg-transparent text-white/60 border-white/30 hover:border-white hover:text-white"
                        }`}
                      >
                        PRESENT
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center">
                <div className="font-mono text-xs text-gray-400 uppercase">
                  {doc.status === "processing" ? "GENERATING THUMBNAILS..." : "NO PAGES YET"}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Share links — filtered to active tab */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-mono text-xs uppercase tracking-widest text-gray-500">SHARE LINKS</h2>
            <button
              onClick={() => createLink.mutate({
                documentId: docId,
                ...(activeSubDeckId !== null ? { subDeckId: activeSubDeckId } : {}),
              })}
              disabled={createLink.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--color-brand)] text-black font-mono text-xs uppercase tracking-widest border border-black ds-shadow-sm ds-hover disabled:opacity-50"
            >
              <Plus size={12} />
              NEW LINK
            </button>
          </div>

          {visibleLinks.length === 0 ? (
            <div className="border border-black p-10 text-center bg-gray-50">
              <div className="w-10 h-10 bg-black border border-black flex items-center justify-center mx-auto mb-4">
                <Link2 size={18} className="text-[var(--color-brand)]" />
              </div>
              <p className="font-mono text-xs uppercase tracking-widest text-gray-400 mb-4">NO SHARE LINKS YET</p>
              <button
                onClick={() => createLink.mutate({
                  documentId: docId,
                  ...(activeSubDeckId !== null ? { subDeckId: activeSubDeckId } : {}),
                })}
                className="px-6 py-2.5 bg-black text-white font-mono text-xs uppercase tracking-widest border border-black ds-shadow-sm ds-hover"
              >
                CREATE FIRST LINK
              </button>
            </div>
          ) : (
            <div className="space-y-0">
              {visibleLinks.map((link: any, i: number) => (
                <div
                  key={link.id}
                  className="border border-black p-5 bg-white"
                  style={{ marginTop: i > 0 ? "-1px" : 0 }}
                >
                  {/* ── Link label ── */}
                  <div className="flex items-center gap-2 mb-3">
                    <Tag size={10} className="text-gray-400 flex-shrink-0" />
                    {editingLabelId === link.id ? (
                      <div className="flex items-center gap-1 flex-1">
                        <input
                          autoFocus
                          type="text"
                          value={editLabelValue}
                          onChange={(e) => setEditLabelValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              updateLink.mutate({ id: link.id, label: editLabelValue || null });
                              setEditingLabelId(null);
                              toast.success("Label saved");
                            }
                            if (e.key === "Escape") setEditingLabelId(null);
                          }}
                          maxLength={80}
                          placeholder="e.g. Investor Version, Press Kit..."
                          className="flex-1 border border-black px-2 py-1 font-mono text-xs focus:outline-none focus:border-[var(--color-brand)]"
                        />
                        <button
                          onClick={() => {
                            updateLink.mutate({ id: link.id, label: editLabelValue || null });
                            setEditingLabelId(null);
                            toast.success("Label saved");
                          }}
                          className="px-2 py-1 bg-[var(--color-brand)] border border-black font-mono text-xs"
                        >SAVE</button>
                        <button
                          onClick={() => setEditingLabelId(null)}
                          className="px-2 py-1 border border-black font-mono text-xs hover:bg-gray-100"
                        >✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingLabelId(link.id); setEditLabelValue(link.label || ""); }}
                        className="font-mono text-xs text-gray-500 hover:text-black flex items-center gap-1 group"
                      >
                        {link.label ? (
                          <span className="text-black font-bold uppercase tracking-widest">{link.label}</span>
                        ) : (
                          <span className="text-gray-400 italic">ADD LABEL (e.g. Investor Version)</span>
                        )}
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-0 group-hover:opacity-100 ml-1"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    )}
                  </div>

                  {/* ── Link URL row ── */}
                  <div className="flex items-center gap-2 mb-4">
                    <div className={`w-2 h-2 flex-shrink-0 ${link.isEnabled ? "bg-[var(--color-brand)]" : "bg-gray-300"} border border-black`} />
                    {editingSlugId === link.id ? (
                      <div className="flex-1">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs text-gray-400 whitespace-nowrap">{baseUrl}/view/</span>
                          <input
                            autoFocus
                            type="text"
                            value={editSlugValue}
                            onChange={(e) => { setEditSlugValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); setSlugError(""); }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") updateSlug.mutate({ id: link.id, slug: editSlugValue });
                              if (e.key === "Escape") { setEditingSlugId(null); setSlugError(""); }
                            }}
                            className="flex-1 border border-black px-2 py-1 font-mono text-xs focus:outline-none focus:border-[var(--color-brand)] min-w-0"
                            placeholder="my-custom-slug"
                          />
                          <button
                            onClick={() => updateSlug.mutate({ id: link.id, slug: editSlugValue })}
                            disabled={updateSlug.isPending || editSlugValue.length < 3}
                            className="px-2 py-1 bg-[var(--color-brand)] border border-black font-mono text-xs disabled:opacity-50"
                          >SAVE</button>
                          <button
                            onClick={() => { setEditingSlugId(null); setSlugError(""); }}
                            className="px-2 py-1 border border-black font-mono text-xs hover:bg-gray-100"
                          >✕</button>
                        </div>
                        {slugError && <span className="font-mono text-xs text-red-500 mt-1 block">{slugError}</span>}
                        <span className="font-mono text-xs text-gray-400 mt-0.5 block">Lowercase, numbers, hyphens. Min 3 chars.</span>
                      </div>
                    ) : (
                      <>
                        <code className="font-mono text-xs text-gray-600 flex-1 truncate">
                          {baseUrl}/view/{link.slug}
                        </code>
                        <button
                          onClick={() => { setEditingSlugId(link.id); setEditSlugValue(link.slug); setSlugError(""); }}
                          className="p-1.5 border border-black hover:bg-[var(--color-brand)] transition-colors"
                          title="Customise URL"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                      </>
                    )}
                    {editingSlugId !== link.id && (
                      <>
                        <button onClick={() => copyLink(link.slug)} className="p-1.5 border border-black hover:bg-[var(--color-brand)] transition-colors" title="Copy link">
                          <Copy size={12} />
                        </button>
                        <a href={`/view/${link.slug}`} target="_blank" rel="noopener noreferrer" className="p-1.5 border border-black hover:bg-[var(--color-brand)] transition-colors" title="Open link">
                          <ExternalLink size={12} />
                        </a>
                        <button onClick={() => deleteLink.mutate({ id: link.id })} className="p-1.5 border border-black hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors" title="Delete link">
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>

                  {/* ── Controls row ── */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="border border-black p-3">
                      <div className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-2">STATUS</div>
                      <button
                        onClick={() => updateLink.mutate({ id: link.id, isEnabled: !link.isEnabled })}
                        className={`flex items-center gap-2 font-mono text-xs uppercase tracking-widest ${link.isEnabled ? "text-[var(--color-brand)]" : "text-gray-400"}`}
                      >
                        {link.isEnabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        {link.isEnabled ? "ACTIVE" : "DISABLED"}
                      </button>
                    </div>
                    <div className="border border-black p-3">
                      <div className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1">
                        <Lock size={10} /> PASSWORD
                      </div>
                      {editingLinkId === link.id ? (
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            placeholder="Set password..."
                            className="flex-1 border border-black px-2 py-1 font-mono text-xs focus:outline-none focus:border-[var(--color-brand)] min-w-0"
                          />
                          <button
                            onClick={() => { updateLink.mutate({ id: link.id, password: editPassword || null }); setEditingLinkId(null); toast.success("Password updated"); }}
                            className="px-2 py-1 bg-[var(--color-brand)] border border-black font-mono text-xs"
                          >OK</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingLinkId(link.id); setEditPassword(link.password || ""); }}
                          className="font-mono text-xs text-gray-600 hover:text-black"
                        >
                          {link.password ? "••••••" : "NONE — SET"}
                        </button>
                      )}
                    </div>
                    <div className="border border-black p-3">
                      <div className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1">
                        <Calendar size={10} /> EXPIRES
                      </div>
                      <input
                        type="date"
                        value={link.expiresAt ? new Date(link.expiresAt).toISOString().split("T")[0] : ""}
                        onChange={(e) => updateLink.mutate({ id: link.id, expiresAt: e.target.value ? new Date(e.target.value).getTime() : null })}
                        className="font-mono text-xs border-0 focus:outline-none bg-transparent w-full text-gray-600"
                      />
                    </div>
                  </div>

                  {/* ── OG Preview chooser ── */}
                  <div className="mt-3 border border-black p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-xs uppercase tracking-widest text-gray-500 flex items-center gap-1">
                        <Image size={10} /> LINK PREVIEW IMAGE
                      </div>
                      <button
                        onClick={() => setShowOgChooser(showOgChooser === link.id ? null : link.id)}
                        className={`font-mono text-xs uppercase tracking-widest px-3 py-1 border border-black transition-colors ${showOgChooser === link.id ? "bg-[var(--color-brand)] text-black" : "hover:bg-gray-100"}`}
                      >
                        {showOgChooser === link.id ? "CANCEL" : "CHOOSE PAGE"}
                      </button>
                    </div>
                    {link.ogPreviewPageNumber && (
                      <div className="mt-2 flex items-center gap-3">
                        <span className="font-mono text-xs text-gray-500">CURRENT: PAGE {link.ogPreviewPageNumber}</span>
                        {doc.pages?.find(p => p.pageNumber === link.ogPreviewPageNumber) && (
                          <img
                            src={doc.pages.find(p => p.pageNumber === link.ogPreviewPageNumber)!.thumbnailUrl}
                            alt="Preview"
                            className="w-20 border border-black"
                          />
                        )}
                      </div>
                    )}
                    {showOgChooser === link.id && (
                      <p className="mt-2 font-mono text-xs text-[var(--color-brand)] uppercase tracking-widest animate-pulse">
                        HOVER A PAGE ON THE LEFT AND CLICK "SET AS PREVIEW"
                      </p>
                    )}
                  </div>

                  {/* ── OG Title + Description ── */}
                  <div className="mt-3 border border-black p-3 space-y-3">
                    <div>
                      <div className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1">
                        <Tag size={10} /> LINK PREVIEW TITLE
                      </div>
                      <input
                        type="text"
                        value={getOgDraft(link).title}
                        onChange={(e) => setOgTitle(link.id, e.target.value)}
                        placeholder={doc.title || "Custom title for social previews..."}
                        maxLength={256}
                        className="w-full font-mono text-xs border border-black px-2 py-1.5 focus:outline-none focus:border-[var(--color-brand)] bg-white text-black placeholder-gray-400"
                      />
                      <div className="font-mono text-xs text-gray-400 mt-1">LEAVE BLANK TO USE DOCUMENT TITLE · MAX 256 CHARS</div>
                    </div>
                    <div>
                      <div className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1">
                        <Tag size={10} /> LINK PREVIEW DESCRIPTION
                      </div>
                      <textarea
                        value={getOgDraft(link).description}
                        onChange={(e) => setOgDescription(link.id, e.target.value)}
                        placeholder="Custom description for WhatsApp, iMessage, Telegram previews..."
                        rows={3}
                        maxLength={500}
                        className="w-full font-mono text-xs border border-black px-2 py-1.5 focus:outline-none focus:border-[var(--color-brand)] resize-none bg-white text-black placeholder-gray-400"
                      />
                      <div className="font-mono text-xs text-gray-400 mt-1">MAX 500 CHARS</div>
                    </div>
                    <button
                      onClick={() => saveOgMeta(link)}
                      disabled={updateLink.isPending || getOgDraft(link).saved}
                      className={`w-full py-2 font-mono text-xs uppercase tracking-widest border border-black transition-colors ${
                        getOgDraft(link).saved
                          ? "bg-gray-100 text-gray-400 cursor-default"
                          : "bg-[var(--color-brand)] text-black hover:bg-[#00e68a] ds-shadow-sm ds-hover"
                      }`}
                    >
                      {updateLink.isPending ? "SAVING..." : getOgDraft(link).saved ? "SAVED ✓" : "SAVE PREVIEW METADATA"}
                    </button>
                  </div>

                  {/* ── Slide Manager ── */}
                  <div className="mt-3">
                    <button
                      onClick={() => setExpandedSlideManager(expandedSlideManager === link.id ? null : link.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 border border-black font-mono text-xs uppercase tracking-widest transition-colors ${
                        expandedSlideManager === link.id ? "bg-black text-white" : "hover:bg-gray-50"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Layers size={10} />
                        SLIDE ORDER &amp; VISIBILITY
                        {link.slideConfig && Array.isArray(link.slideConfig) && link.slideConfig.length > 0 && (
                          <span className="px-1.5 py-0.5 bg-[var(--color-brand)] text-black text-xs border border-black">CUSTOM</span>
                        )}
                      </span>
                      <span>{expandedSlideManager === link.id ? "▲" : "▼"}</span>
                    </button>
                    {expandedSlideManager === link.id && doc.pages && doc.pages.length > 0 && (
                      <SlideManager
                        pages={doc.pages}
                        slideConfig={link.slideConfig || null}
                        onSave={(config) => {
                          updateLink.mutate({ id: link.id, slideConfig: config });
                          toast.success("Slide config saved");
                        }}
                        onReset={() => {
                          updateLink.mutate({ id: link.id, slideConfig: [] });
                          toast.success("Reset to default order");
                        }}
                        isSaving={updateLink.isPending}
                      />
                    )}
                  </div>

                  {/* ── Link stats footer ── */}
                  <div className="mt-3 flex items-center gap-4">
                    <span className="font-mono text-xs text-gray-400">
                      <Eye size={10} className="inline mr-1" />
                      {link.viewCount ?? 0} VIEWS
                    </span>
                    <span className="font-mono text-xs text-gray-400">
                      CREATED {new Date(link.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Per-page analytics */}
          {activeStats?.pageStats && activeStats.pageStats.length > 0 && (
            <div className="mt-6">
              <h2 className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
                <BarChart2 size={12} /> PAGE ENGAGEMENT
              </h2>
              <div className="border border-black">
                {activeStats.pageStats.map((ps: any) => {
                  const maxViews = Math.max(...activeStats.pageStats.map((p: any) => p.views));
                  const pct = maxViews > 0 ? (ps.views / maxViews) * 100 : 0;
                  return (
                    <div key={ps.pageNumber} className="flex items-center gap-4 px-4 py-2.5 border-b border-black last:border-b-0">
                      <span className="font-mono text-xs text-gray-400 w-12">PG {ps.pageNumber}</span>
                      <div className="flex-1 bg-gray-100 border border-black h-4 relative">
                        <div className="h-full bg-[var(--color-brand)] border-r border-black" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="font-mono text-xs font-bold w-16 text-right">{ps.views} views</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Narration panel — always shown on all tabs */}
      {doc.pages && doc.pages.length > 0 && (
        <>
          <div className="mt-8">
            <h2 className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
              <span>SLIDE NARRATION</span>
              <span className="text-gray-300">— ADD VOICE-OVER VIDEOS PER SLIDE</span>
            </h2>
            <NarrationPanel
              documentId={docId}
              pages={(doc.pages ?? []).map((p) => ({ pageNumber: p.pageNumber, thumbnailUrl: p.thumbnailUrl }))}
              versionId={activeVersionId}
            />
          </div>

          <div className="mt-8">
            <h2 className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
              <span>VIDEO SLIDES</span>
              <span className="text-gray-300">— EMBED A VIDEO AS A SLIDE</span>
            </h2>
            <VideoSlidePanel
              documentId={docId}
              pages={(doc.pages ?? []).map((p) => ({ pageNumber: p.pageNumber, thumbnailUrl: p.thumbnailUrl }))}
            />
          </div>
        </>
      )}
    </AppLayout>
  );
}
