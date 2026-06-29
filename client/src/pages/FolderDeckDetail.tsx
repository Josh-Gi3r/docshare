import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { getShareBaseUrl } from "@/lib/baseUrl";
import { useParams, useLocation } from "wouter";
import { useState, useRef } from "react";
import NarrationPanel from "@/components/NarrationPanel";
import VideoSlidePanel from "@/components/VideoSlidePanel";
import {
  Link2, Eye, Users, Clock, Plus, Trash2, Copy, ExternalLink,
  Lock, Calendar, ToggleLeft, ToggleRight, ChevronLeft, Tag,
  Layers, GripVertical, EyeOff, RotateCcw, X, Check, BarChart2,
} from "lucide-react";
import { toast } from "sonner";

// ── SlideManager (identical to DocumentDetail) ───────────────────────────────
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
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, hidden: !r.hidden } : r)));
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
            className={`flex items-center gap-2 px-3 py-1.5 border-b border-black last:border-b-0 cursor-grab active:cursor-grabbing ${row.hidden ? "opacity-40 bg-gray-50" : "bg-white"}`}
          >
            <GripVertical size={12} className="text-gray-300 flex-shrink-0" />
            <img src={thumbFor(row.pageNumber)} alt={`Slide ${row.pageNumber}`} className="w-10 border border-black flex-shrink-0" style={{ aspectRatio: "16/9" }} />
            <span className="font-mono text-xs text-gray-500 flex-1">SLIDE {row.pageNumber}</span>
            <button onClick={() => toggleHidden(idx)} className={`p-1 border border-black transition-colors ${row.hidden ? "bg-gray-200 hover:bg-[var(--color-brand)]" : "hover:bg-gray-100"}`} title={row.hidden ? "Show slide" : "Hide slide"}>
              <EyeOff size={10} className={row.hidden ? "text-gray-400" : "text-black"} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 border-t border-black bg-gray-50">
        <button onClick={() => onSave(rows)} disabled={isSaving} className="flex-1 py-1.5 bg-[var(--color-brand)] border border-black font-mono text-xs uppercase tracking-widest text-black disabled:opacity-50">
          {isSaving ? "SAVING..." : "SAVE CONFIG"}
        </button>
        <button onClick={() => { setRows(buildDefault()); onReset(); }} className="px-3 py-1.5 border border-black font-mono text-xs uppercase tracking-widest hover:bg-gray-100 flex items-center gap-1">
          <RotateCcw size={10} /> RESET
        </button>
      </div>
    </div>
  );
}

// ── Add Slides Modal ──────────────────────────────────────────────────────────
function AddSlidesModal({
  folderId,
  deckId,
  existingPageIds,
  onClose,
  onSaved,
}: {
  folderId: number;
  deckId: number;
  existingPageIds: number[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: folder } = trpc.folders.get.useQuery({ id: folderId });
  const [selected, setSelected] = useState<Set<number>>(new Set(existingPageIds));
  const saveSlots = trpc.composedDecks.saveSlots.useMutation({
    onSuccess: () => { onSaved(); onClose(); toast.success("Slides updated"); },
    onError: (e) => toast.error(e.message),
  });

  const allPages = (folder?.documents ?? []).flatMap((doc: any) =>
    (doc.pages ?? []).map((p: any) => ({ ...p, docTitle: doc.title }))
  );

  const toggle = (pageId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  const handleSave = () => {
    const slots = allPages
      .filter((p: any) => selected.has(p.id))
      .map((p: any, idx: number) => ({
        position: idx,
        documentPageId: p.id,
        narrationAssetId: null,
        customNarrationUrl: null,
        customNarrationKey: null,
      }));
    saveSlots.mutate({ deckId, slots });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-black w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black flex-shrink-0">
          <h2 className="font-sans font-bold text-sm uppercase tracking-tight">ADD SLIDES TO DECK</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 transition-colors"><X size={14} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {(folder?.documents ?? []).map((doc: any) => (
            <div key={doc.id} className="mb-4">
              <div className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-2">
                <span>{doc.title}</span>
                <span className="text-gray-300">— {doc.pages?.length ?? 0} SLIDES</span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {(doc.pages ?? []).map((page: any) => (
                  <div
                    key={page.id}
                    onClick={() => toggle(page.id)}
                    className={`relative cursor-pointer border-2 transition-all ${selected.has(page.id) ? "border-[var(--color-brand)]" : "border-black hover:border-gray-400"}`}
                  >
                    <img src={page.thumbnailUrl} alt={`Slide ${page.pageNumber}`} className="w-full" style={{ aspectRatio: "16/9" }} />
                    {selected.has(page.id) && (
                      <div className="absolute top-1 right-1 w-4 h-4 bg-[var(--color-brand)] border border-black flex items-center justify-center">
                        <Check size={10} />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                      <span className="font-mono text-xs text-white">{page.pageNumber}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {allPages.length === 0 && (
            <div className="text-center py-12">
              <p className="font-mono text-xs uppercase tracking-widest text-gray-400">NO DOCUMENTS IN FOLDER YET</p>
              <p className="font-mono text-xs text-gray-300 mt-2">Upload documents to the folder first</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-t border-black flex-shrink-0">
          <span className="font-mono text-xs text-gray-500">{selected.size} SLIDES SELECTED</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 border border-black font-mono text-xs uppercase tracking-widest hover:bg-gray-100">CANCEL</button>
            <button onClick={handleSave} disabled={saveSlots.isPending} className="px-4 py-2 bg-[var(--color-brand)] border border-black font-mono text-xs uppercase tracking-widest disabled:opacity-50">
              {saveSlots.isPending ? "SAVING..." : "SAVE SLIDES"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main FolderDeckDetail ─────────────────────────────────────────────────────
export default function FolderDeckDetail() {
  const { folderId: folderIdStr, deckId: deckIdStr } = useParams<{ folderId: string; deckId: string }>();
  const folderId = parseInt(folderIdStr, 10);
  const deckId = parseInt(deckIdStr, 10);
  const [, setLocation] = useLocation();

  // ── State ────────────────────────────────────────────────────────────────────
  const [editingLabelId, setEditingLabelId] = useState<number | null>(null);
  const [editLabelValue, setEditLabelValue] = useState("");
  const [editingLinkId, setEditingLinkId] = useState<number | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [editingSlugId, setEditingSlugId] = useState<number | null>(null);
  const [editSlugValue, setEditSlugValue] = useState("");
  const [slugError, setSlugError] = useState("");
  const [showOgChooser, setShowOgChooser] = useState<number | null>(null);
  const [expandedSlideManager, setExpandedSlideManager] = useState<number | null>(null);
  const [ogDrafts, setOgDrafts] = useState<Record<number, { title: string; description: string; saved: boolean }>>({});
  const [showAddSlides, setShowAddSlides] = useState(false);
  const [showNewDeckForm, setShowNewDeckForm] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");

  // ── Data ────────────────────────────────────────────────────────────────────
  const validIds = !isNaN(folderId) && !isNaN(deckId);
  const { data: folder } = trpc.folders.get.useQuery({ id: folderId }, { enabled: !isNaN(folderId) });
  const { data: deck, refetch: refetchDeck } = trpc.composedDecks.get.useQuery({ id: deckId }, { enabled: validIds });
  const { data: links, refetch: refetchLinks } = trpc.shareLinks.listForDeck.useQuery({ composedDeckId: deckId }, { enabled: validIds });
  const { data: analytics } = trpc.analytics.deckStats.useQuery({ composedDeckId: deckId }, { enabled: validIds });

  const createLink = trpc.shareLinks.createForDeck.useMutation({
    onSuccess: () => { refetchLinks(); toast.success("Share link created"); },
    onError: (e) => toast.error(e.message),
  });
  const updateLink = trpc.shareLinks.update.useMutation({
    onSuccess: () => refetchLinks(),
    onError: (e) => toast.error(e.message),
  });
  const deleteLink = trpc.shareLinks.delete.useMutation({
    onSuccess: () => { refetchLinks(); toast.success("Link deleted"); },
    onError: (e) => toast.error(e.message),
  });
  const updateSlug = trpc.shareLinks.updateSlug.useMutation({
    onSuccess: (data) => { setEditingSlugId(null); refetchLinks(); toast.success("URL updated"); },
    onError: (e) => { setSlugError(e.message); },
  });
  const createDeck = trpc.composedDecks.create.useMutation({
    onSuccess: (data) => {
      setShowNewDeckForm(false);
      setNewDeckName("");
      setLocation(`/folders/${folderId}/decks/${data.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const baseUrl = getShareBaseUrl();

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`${baseUrl}/view/${slug}`);
    toast.success("Link copied to clipboard");
  };

  const getOgDraft = (link: { id: number; ogTitle?: string | null; ogDescription?: string | null }) => {
    if (ogDrafts[link.id]) return ogDrafts[link.id];
    return { title: (link as any).ogTitle || "", description: (link as any).ogDescription || "", saved: true };
  };
  const setOgTitle = (linkId: number, title: string) => {
    setOgDrafts(prev => ({ ...prev, [linkId]: { ...getOgDraft({ id: linkId }), title, saved: false } }));
  };
  const setOgDescription = (linkId: number, description: string) => {
    setOgDrafts(prev => ({ ...prev, [linkId]: { ...getOgDraft({ id: linkId }), description, saved: false } }));
  };
  const saveOgMeta = (link: { id: number; ogTitle?: string | null; ogDescription?: string | null }) => {
    const draft = getOgDraft(link);
    updateLink.mutate(
      { id: link.id, ogTitle: draft.title.trim() || null, ogDescription: draft.description.trim() || null },
      { onSuccess: () => setOgDrafts(prev => ({ ...prev, [link.id]: { ...draft, saved: true } })) }
    );
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (!deck || !folder) {
    return (
      <AppLayout>
        <div className="font-mono text-xs uppercase tracking-widest text-gray-400 animate-pulse">LOADING...</div>
      </AppLayout>
    );
  }

  // Build pages array from deck slots
  const deckPages = (deck.slots ?? [])
    .sort((a: any, b: any) => a.position - b.position)
    .filter((s: any) => s.page)
    .map((s: any) => ({
      id: s.page.id,
      pageNumber: s.page.pageNumber,
      thumbnailUrl: s.page.thumbnailUrl,
    }));

  const existingPageIds = deckPages.map((p: any) => p.id);
  // Sort decks oldest-first so the first deck (lowest idx) is always the MASTER
  const allDecks = [...(folder.decks ?? [])].sort(
    (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // Unique source documents that have slides in this deck
  const sourceDocIds = Array.from(
    new Set(
      (deck.slots ?? [])
        .filter((s: any) => s.page?.documentId)
        .map((s: any) => s.page.documentId as number)
    )
  );
  // Build pages array per source document for narration/video panels
  const pagesByDocId: Record<number, Array<{ pageNumber: number; thumbnailUrl: string }>> = {};
  for (const slot of (deck.slots ?? [])) {
    if (!slot.page?.documentId) continue;
    const docId = slot.page.documentId as number;
    if (!pagesByDocId[docId]) pagesByDocId[docId] = [];
    pagesByDocId[docId].push({ pageNumber: slot.page.pageNumber, thumbnailUrl: slot.page.thumbnailUrl });
  }
  // Document titles for labelling
  const docTitleById: Record<number, string> = {};
  for (const doc of (folder.documents ?? [])) {
    docTitleById[(doc as any).id] = (doc as any).title;
  }

  return (
    <AppLayout>
      {/* Back + Title bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-4">
        <button
          onClick={() => setLocation(`/folders/${folderId}`)}
          className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-gray-500 hover:text-black transition-colors self-start"
        >
          <ChevronLeft size={14} />
          BACK
        </button>
        <div className="flex-1 border-l border-black pl-4">
          <div className="font-mono text-xs text-gray-400 uppercase tracking-widest mb-0.5">{folder.name}</div>
          <h1 className="font-sans text-lg sm:text-xl font-bold uppercase tracking-tight leading-tight">{deck.name}</h1>
        </div>
      </div>

      {/* Deck Tabs */}
      <div className="flex items-end gap-0 mb-6 border-b border-black overflow-x-auto">
        {/* Tabs + NEW TAB button all in a single left-to-right flex row */}
        <div className="flex items-end gap-0 min-w-0 overflow-x-auto">
          {allDecks.map((d: any, idx: number) => {
            const isMaster = idx === 0;
            const isActive = d.id === deckId;
            return (
              <button
                key={d.id}
                onClick={() => setLocation(`/folders/${folderId}/decks/${d.id}`)}
                className={`px-4 py-2.5 font-mono text-xs uppercase tracking-widest whitespace-nowrap border border-b-0 transition-colors flex-shrink-0 flex items-center gap-2 ${
                  isActive
                    ? "bg-white border-black text-black -mb-px"
                    : "bg-gray-50 border-transparent text-gray-400 hover:text-black hover:bg-gray-100"
                }`}
              >
                {d.name}
                {isMaster && (
                  <span className="px-1 py-0.5 bg-black text-white font-mono text-[9px] uppercase tracking-widest leading-none">MASTER</span>
                )}
              </button>
            );
          })}
          {/* + NEW TAB sits immediately after the last tab */}
          {showNewDeckForm ? (
            <div className="flex items-center gap-1 px-2 py-1.5 border border-b-0 border-black bg-white -mb-px flex-shrink-0">
              <input
                autoFocus
                type="text"
                value={newDeckName}
                onChange={(e) => setNewDeckName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newDeckName.trim()) createDeck.mutate({ folderId, name: newDeckName.trim() });
                  if (e.key === "Escape") { setShowNewDeckForm(false); setNewDeckName(""); }
                }}
                className="border border-black px-2 py-1 font-mono text-xs focus:outline-none focus:border-[var(--color-brand)] w-32"
                placeholder="Tab name..."
              />
              <button
                disabled={!newDeckName.trim() || createDeck.isPending}
                onClick={() => createDeck.mutate({ folderId, name: newDeckName.trim() })}
                className="p-1 bg-[var(--color-brand)] border border-black font-mono text-xs disabled:opacity-50"
              >
                <Check size={10} />
              </button>
              <button onClick={() => { setShowNewDeckForm(false); setNewDeckName(""); }} className="p-1 border border-black hover:bg-gray-100">
                <X size={10} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewDeckForm(true)}
              className="px-3 py-2.5 font-mono text-xs uppercase tracking-widest text-gray-400 hover:text-black hover:bg-gray-100 flex items-center gap-1 flex-shrink-0"
            >
              <Plus size={10} /> NEW TAB
            </button>
          )}
        </div>
      </div>

      {/* Analytics stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 mb-8">
        {[
          { label: "TOTAL VIEWS", value: analytics?.totalViews ?? 0, icon: Eye },
          { label: "UNIQUE VISITORS", value: analytics?.uniqueVisitors ?? 0, icon: Users },
          { label: "AVG. TIME", value: analytics?.totalTimeSpent ? `${Math.round(analytics.totalTimeSpent)}s` : "—", icon: Clock },
          { label: "ACTIVE LINKS", value: links?.filter((l: any) => l.isEnabled).length ?? 0, icon: Link2 },
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

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-6">
        {/* Left: Slides */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-mono text-xs uppercase tracking-widest text-gray-500">PAGES</h2>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gray-400">{deckPages.length} SLIDES</span>
              <button
                onClick={() => setShowAddSlides(true)}
                className="flex items-center gap-1 px-2 py-1 border border-black font-mono text-xs uppercase tracking-widest hover:bg-[var(--color-brand)] transition-colors"
              >
                <Plus size={10} /> ADD SLIDES
              </button>
            </div>
          </div>
          <div className="border border-black overflow-hidden max-h-[600px] overflow-y-auto">
            {deckPages.length > 0 ? (
              deckPages.map((page: any) => (
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
                    <span className="font-mono text-xs text-white">PAGE {page.pageNumber}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-10 text-center bg-gray-50">
                <div className="w-10 h-10 bg-black border border-black flex items-center justify-center mx-auto mb-4">
                  <Layers size={18} className="text-[var(--color-brand)]" />
                </div>
                <p className="font-mono text-xs uppercase tracking-widest text-gray-400 mb-4">NO SLIDES YET</p>
                <button
                  onClick={() => setShowAddSlides(true)}
                  className="px-6 py-2.5 bg-black text-white font-mono text-xs uppercase tracking-widest border border-black"
                >
                  ADD SLIDES
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Share Links */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-mono text-xs uppercase tracking-widest text-gray-500">SHARE LINKS</h2>
            <button
              onClick={() => createLink.mutate({ composedDeckId: deckId })}
              disabled={createLink.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--color-brand)] text-black font-mono text-xs uppercase tracking-widest border border-black ds-shadow-sm ds-hover disabled:opacity-50"
            >
              <Plus size={12} />
              NEW LINK
            </button>
          </div>

          {!links || links.length === 0 ? (
            <div className="border border-black p-10 text-center bg-gray-50">
              <div className="w-10 h-10 bg-black border border-black flex items-center justify-center mx-auto mb-4">
                <Link2 size={18} className="text-[var(--color-brand)]" />
              </div>
              <p className="font-mono text-xs uppercase tracking-widest text-gray-400 mb-4">NO SHARE LINKS YET</p>
              <button
                onClick={() => createLink.mutate({ composedDeckId: deckId })}
                className="px-6 py-2.5 bg-black text-white font-mono text-xs uppercase tracking-widest border border-black ds-shadow-sm ds-hover"
              >
                CREATE FIRST LINK
              </button>
            </div>
          ) : (
            <div className="space-y-0">
              {links.map((link: any, i: number) => (
                <div key={link.id} className="border border-black p-5 bg-white" style={{ marginTop: i > 0 ? "-1px" : 0 }}>
                  {/* Label */}
                  <div className="flex items-center gap-2 mb-3">
                    <Tag size={10} className="text-gray-400 flex-shrink-0" />
                    {editingLabelId === link.id ? (
                      <div className="flex items-center gap-1 flex-1">
                        <input
                          autoFocus type="text" value={editLabelValue}
                          onChange={(e) => setEditLabelValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { updateLink.mutate({ id: link.id, label: editLabelValue || null }); setEditingLabelId(null); toast.success("Label saved"); }
                            if (e.key === "Escape") setEditingLabelId(null);
                          }}
                          maxLength={80} placeholder="e.g. Investor Version, Press Kit..."
                          className="flex-1 border border-black px-2 py-1 font-mono text-xs focus:outline-none focus:border-[var(--color-brand)]"
                        />
                        <button onClick={() => { updateLink.mutate({ id: link.id, label: editLabelValue || null }); setEditingLabelId(null); toast.success("Label saved"); }} className="px-2 py-1 bg-[var(--color-brand)] border border-black font-mono text-xs">SAVE</button>
                        <button onClick={() => setEditingLabelId(null)} className="px-2 py-1 border border-black font-mono text-xs hover:bg-gray-100">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingLabelId(link.id); setEditLabelValue(link.label || ""); }} className="font-mono text-xs text-gray-400 italic hover:text-black transition-colors">
                        {link.label || "ADD LABEL (e.g. Investor Version)"}
                      </button>
                    )}
                  </div>

                  {/* URL row */}
                  <div className="flex items-center gap-1 mb-3 p-2 border border-black bg-gray-50">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: link.isEnabled ? "var(--color-brand)" : "#9ca3af" }} />
                    {editingSlugId === link.id ? (
                      <div className="flex items-center gap-1 flex-1">
                        <span className="font-mono text-xs text-gray-400 whitespace-nowrap">{baseUrl}/view/</span>
                        <input
                          autoFocus type="text" value={editSlugValue}
                          onChange={(e) => { setEditSlugValue(e.target.value); setSlugError(""); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") updateSlug.mutate({ id: link.id, slug: editSlugValue });
                            if (e.key === "Escape") setEditingSlugId(null);
                          }}
                          className="flex-1 border border-black px-2 py-1 font-mono text-xs focus:outline-none focus:border-[var(--color-brand)] min-w-0"
                        />
                        <button onClick={() => updateSlug.mutate({ id: link.id, slug: editSlugValue })} disabled={updateSlug.isPending} className="px-2 py-1 bg-[var(--color-brand)] border border-black font-mono text-xs disabled:opacity-50">OK</button>
                        <button onClick={() => setEditingSlugId(null)} className="px-2 py-1 border border-black font-mono text-xs hover:bg-gray-100">✕</button>
                      </div>
                    ) : (
                      <>
                        <code className="font-mono text-xs text-gray-600 flex-1 truncate">{baseUrl}/view/{link.slug}</code>
                        <button onClick={() => { setEditingSlugId(link.id); setEditSlugValue(link.slug); setSlugError(""); }} className="p-1.5 border border-black hover:bg-[var(--color-brand)] transition-colors" title="Customise URL">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                      </>
                    )}
                    {editingSlugId !== link.id && (
                      <>
                        <button onClick={() => copyLink(link.slug)} className="p-1.5 border border-black hover:bg-[var(--color-brand)] transition-colors" title="Copy link"><Copy size={12} /></button>
                        <a href={`/view/${link.slug}`} target="_blank" rel="noopener noreferrer" className="p-1.5 border border-black hover:bg-[var(--color-brand)] transition-colors" title="Open link"><ExternalLink size={12} /></a>
                        <button onClick={() => deleteLink.mutate({ id: link.id })} className="p-1.5 border border-black hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors" title="Delete link"><Trash2 size={12} /></button>
                      </>
                    )}
                  </div>
                  {slugError && <span className="font-mono text-xs text-red-500 mb-2 block">{slugError}</span>}

                  {/* Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="border border-black p-3">
                      <div className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-2">STATUS</div>
                      <button onClick={() => updateLink.mutate({ id: link.id, isEnabled: !link.isEnabled })} className={`flex items-center gap-2 font-mono text-xs uppercase tracking-widest ${link.isEnabled ? "text-[var(--color-brand)]" : "text-gray-400"}`}>
                        {link.isEnabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        {link.isEnabled ? "ACTIVE" : "DISABLED"}
                      </button>
                    </div>
                    <div className="border border-black p-3">
                      <div className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1"><Lock size={10} /> PASSWORD</div>
                      {editingLinkId === link.id ? (
                        <div className="flex gap-1">
                          <input type="text" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Set password..." className="flex-1 border border-black px-2 py-1 font-mono text-xs focus:outline-none focus:border-[var(--color-brand)] min-w-0" />
                          <button onClick={() => { updateLink.mutate({ id: link.id, password: editPassword || null }); setEditingLinkId(null); toast.success("Password updated"); }} className="px-2 py-1 bg-[var(--color-brand)] border border-black font-mono text-xs">OK</button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditingLinkId(link.id); setEditPassword(link.password || ""); }} className="font-mono text-xs text-gray-600 hover:text-black">
                          {link.password ? "••••••" : "NONE — SET"}
                        </button>
                      )}
                    </div>
                    <div className="border border-black p-3">
                      <div className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1"><Calendar size={10} /> EXPIRES</div>
                      <input
                        type="date"
                        value={link.expiresAt ? new Date(link.expiresAt).toISOString().split("T")[0] : ""}
                        onChange={(e) => updateLink.mutate({ id: link.id, expiresAt: e.target.value ? new Date(e.target.value).getTime() : null })}
                        className="font-mono text-xs border-0 bg-transparent focus:outline-none text-gray-600 w-full"
                      />
                    </div>
                  </div>

                  {/* OG Preview Image */}
                  <div className="mt-3 border border-black p-3">
                    <div className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1">LINK PREVIEW IMAGE</div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="font-mono text-xs text-gray-400 mb-1">
                          CURRENT: PAGE {link.ogPreviewPageNumber ?? 1}
                        </div>
                        {deckPages.find((p: any) => p.pageNumber === (link.ogPreviewPageNumber ?? 1)) && (
                          <img
                            src={deckPages.find((p: any) => p.pageNumber === (link.ogPreviewPageNumber ?? 1))?.thumbnailUrl}
                            alt="Preview"
                            className="w-24 border border-black"
                            style={{ aspectRatio: "16/9" }}
                          />
                        )}
                      </div>
                      <button
                        onClick={() => setShowOgChooser(showOgChooser === link.id ? null : link.id)}
                        className={`px-3 py-1.5 border border-black font-mono text-xs uppercase tracking-widest transition-colors ${showOgChooser === link.id ? "bg-black text-white" : "hover:bg-[var(--color-brand)]"}`}
                      >
                        {showOgChooser === link.id ? "CANCEL" : "CHOOSE PAGE"}
                      </button>
                    </div>
                    {showOgChooser === link.id && deckPages.length === 0 && (
                      <p className="font-mono text-xs text-gray-400 mt-2 uppercase tracking-widest animate-pulse">HOVER A PAGE ON THE LEFT AND CLICK "SET AS PREVIEW"</p>
                    )}
                  </div>

                  {/* OG Title + Description */}
                  <div className="mt-3 border border-black p-3 space-y-3">
                    <div>
                      <div className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1"><Tag size={10} /> LINK PREVIEW TITLE</div>
                      <input type="text" value={getOgDraft(link).title} onChange={(e) => setOgTitle(link.id, e.target.value)} placeholder={deck.name || "Custom title for social previews..."} maxLength={256} className="w-full font-mono text-xs border border-black px-2 py-1.5 focus:outline-none focus:border-[var(--color-brand)] bg-white text-black placeholder-gray-400" />
                      <div className="font-mono text-xs text-gray-400 mt-1">LEAVE BLANK TO USE DECK NAME · MAX 256 CHARS</div>
                    </div>
                    <div>
                      <div className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1"><Tag size={10} /> LINK PREVIEW DESCRIPTION</div>
                      <textarea value={getOgDraft(link).description} onChange={(e) => setOgDescription(link.id, e.target.value)} placeholder="Custom description for WhatsApp, iMessage, Telegram previews..." rows={3} maxLength={500} className="w-full font-mono text-xs border border-black px-2 py-1.5 focus:outline-none focus:border-[var(--color-brand)] resize-none bg-white text-black placeholder-gray-400" />
                      <div className="font-mono text-xs text-gray-400 mt-1">MAX 500 CHARS</div>
                    </div>
                    <button
                      onClick={() => saveOgMeta(link)}
                      disabled={updateLink.isPending || getOgDraft(link).saved}
                      className={`w-full py-2 font-mono text-xs uppercase tracking-widest border border-black transition-colors ${getOgDraft(link).saved ? "bg-gray-100 text-gray-400 cursor-default" : "bg-[var(--color-brand)] text-black hover:bg-[#00e68a] ds-shadow-sm ds-hover"}`}
                    >
                      {updateLink.isPending ? "SAVING..." : getOgDraft(link).saved ? "SAVED ✓" : "SAVE PREVIEW METADATA"}
                    </button>
                  </div>

                  {/* Slide Manager */}
                  <div className="mt-3">
                    <button
                      onClick={() => setExpandedSlideManager(expandedSlideManager === link.id ? null : link.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 border border-black font-mono text-xs uppercase tracking-widest transition-colors ${expandedSlideManager === link.id ? "bg-black text-white" : "hover:bg-gray-50"}`}
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
                    {expandedSlideManager === link.id && deckPages.length > 0 && (
                      <SlideManager
                        pages={deckPages}
                        slideConfig={link.slideConfig || null}
                        onSave={(config) => { updateLink.mutate({ id: link.id, slideConfig: config }); toast.success("Slide config saved"); }}
                        onReset={() => { updateLink.mutate({ id: link.id, slideConfig: [] }); toast.success("Reset to default order"); }}
                        isSaving={updateLink.isPending}
                      />
                    )}
                  </div>

                  {/* Link stats footer */}
                  <div className="mt-3 flex items-center gap-4">
                    <span className="font-mono text-xs text-gray-400"><Eye size={10} className="inline mr-1" />{link.viewCount ?? 0} VIEWS</span>
                    <span className="font-mono text-xs text-gray-400">CREATED {new Date(link.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Per-page analytics */}
          {analytics && (analytics as any).pageStats && (analytics as any).pageStats.length > 0 && (
            <div className="mt-6">
              <h2 className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
                <BarChart2 size={12} /> PAGE ENGAGEMENT
              </h2>
              <div className="border border-black">
                {(analytics as any).pageStats.map((ps: any) => {
                  const maxViews = Math.max(...(analytics as any).pageStats.map((p: any) => p.views));
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

      {/* Narration + Video Slide panels — one per source document */}
      {sourceDocIds.length > 0 && (
        <div className="mt-8 space-y-8">
          {sourceDocIds.map((docId) => (
            <div key={docId}>
              {sourceDocIds.length > 1 && (
                <div className="font-mono text-xs uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 bg-[var(--color-brand)] border border-black flex-shrink-0" />
                  {docTitleById[docId] || `DOCUMENT ${docId}`}
                </div>
              )}
              <div className="mb-6">
                <h2 className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
                  <span>SLIDE NARRATION</span>
                  <span className="text-gray-300">— ADD VOICE-OVER VIDEOS PER SLIDE</span>
                </h2>
                <NarrationPanel
                  documentId={docId}
                  pages={pagesByDocId[docId] ?? []}
                />
              </div>
              <div>
                <h2 className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-3 flex items-center gap-2">
                  <span>VIDEO SLIDES</span>
                  <span className="text-gray-300">— EMBED A VIDEO AS A SLIDE</span>
                </h2>
                <VideoSlidePanel
                  documentId={docId}
                  pages={pagesByDocId[docId] ?? []}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Slides Modal */}
      {showAddSlides && (
        <AddSlidesModal
          folderId={folderId}
          deckId={deckId}
          existingPageIds={existingPageIds}
          onClose={() => setShowAddSlides(false)}
          onSaved={() => refetchDeck()}
        />
      )}
    </AppLayout>
  );
}
