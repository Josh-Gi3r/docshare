/**
 * SubDecksPanel — shown in DocumentDetail below the narration section.
 *
 * Lets the owner create named sub-decks from the master document.
 * Each sub-deck is a saved slide config (visibility + order + optional
 * narration override per slot) that can have its own share links.
 *
 * UI pattern mirrors the existing SHARE LINKS panel: list of cards,
 * create button top-right, expand each card to edit.
 */
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Plus, Trash2, ChevronDown, ChevronUp, GripVertical,
  EyeOff, Eye, Link2, ExternalLink, Copy, Layers, X
} from "lucide-react";
import { getShareBaseUrl } from "@/lib/baseUrl";

type Page = { id: number; pageNumber: number; thumbnailUrl: string };

// ── Drag-to-reorder row inside a sub-deck ─────────────────────────────────
type SubDeckRow = {
  documentPageId: number;
  position: number;
  isVisible: boolean;
  narrationOverrideUrl: string | null;
  narrationOverrideKey: string | null;
};

function buildDefaultRows(pages: Page[]): SubDeckRow[] {
  return pages.map((p, i) => ({
    documentPageId: p.id,
    position: i,
    isVisible: true,
    narrationOverrideUrl: null,
    narrationOverrideKey: null,
  }));
}

function SubDeckEditor({
  subDeckId,
  pages,
  initialSlides,
  onSaved,
}: {
  subDeckId: number;
  pages: Page[];
  initialSlides: SubDeckRow[];
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<SubDeckRow[]>(() => {
    if (initialSlides.length > 0) {
      // Merge saved config with current pages
      const saved = [...initialSlides].sort((a, b) => a.position - b.position);
      const savedIds = new Set(saved.map((s) => s.documentPageId));
      const extras = pages
        .filter((p) => !savedIds.has(p.id))
        .map((p, i) => ({
          documentPageId: p.id,
          position: saved.length + i,
          isVisible: true,
          narrationOverrideUrl: null,
          narrationOverrideKey: null,
        }));
      return [...saved, ...extras];
    }
    return buildDefaultRows(pages);
  });

  const dragIdx = useRef<number | null>(null);
  const saveSlides = trpc.subDecks.saveSlides.useMutation({
    onSuccess: () => { toast.success("Deck saved"); onSaved(); },
    onError: () => toast.error("Failed to save deck"),
  });

  const thumbFor = (docPageId: number) =>
    pages.find((p) => p.id === docPageId)?.thumbnailUrl || "";
  const pageNumFor = (docPageId: number) =>
    pages.find((p) => p.id === docPageId)?.pageNumber ?? docPageId;

  const toggle = (idx: number) =>
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, isVisible: !r.isVisible } : r));

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

  const handleSave = () => {
    saveSlides.mutate({
      subDeckId,
      slides: rows.map((r, i) => ({ ...r, position: i })),
    });
  };

  const visibleCount = rows.filter((r) => r.isVisible).length;

  return (
    <div className="border border-black mt-3">
      <div className="flex items-center justify-between px-3 py-2 border-b border-black bg-gray-50">
        <span className="font-mono text-xs uppercase tracking-widest text-gray-500">
          SLIDE CONFIG — {visibleCount}/{rows.length} VISIBLE
        </span>
        <button
          onClick={handleSave}
          disabled={saveSlides.isPending}
          className="px-3 py-1 bg-[var(--color-brand)] text-black font-mono text-xs uppercase tracking-widest border border-black hover:opacity-80 disabled:opacity-50"
        >
          {saveSlides.isPending ? "SAVING..." : "SAVE DECK"}
        </button>
      </div>
      <div className="divide-y divide-black/10 max-h-[400px] overflow-y-auto">
        {rows.map((row, idx) => (
          <div
            key={row.documentPageId}
            draggable
            onDragStart={() => onDragStart(idx)}
            onDragOver={(e) => onDragOver(e, idx)}
            onDragEnd={onDragEnd}
            className={`flex items-center gap-3 px-3 py-2 cursor-grab active:cursor-grabbing ${
              row.isVisible ? "bg-white" : "bg-gray-50 opacity-60"
            }`}
          >
            <GripVertical size={12} className="text-gray-300 flex-shrink-0" />
            <img
              src={thumbFor(row.documentPageId)}
              alt={`Slide ${idx + 1}`}
              className="w-14 h-8 object-cover border border-black flex-shrink-0"
            />
            <span className="font-mono text-xs text-gray-500 flex-shrink-0 w-16">
              SLIDE {idx + 1}
              {pageNumFor(row.documentPageId) !== idx + 1 && (
                <span className="text-gray-300 text-[10px] ml-0.5">(orig.{pageNumFor(row.documentPageId)})</span>
              )}
            </span>
            <div className="flex-1" />
            <button
              onClick={() => toggle(idx)}
              className="p-1 hover:bg-gray-100 rounded"
              title={row.isVisible ? "Hide slide" : "Show slide"}
            >
              {row.isVisible
                ? <Eye size={12} className="text-gray-400" />
                : <EyeOff size={12} className="text-gray-300" />}
            </button>
            <button
              onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
              className="p-1 hover:bg-red-100 rounded"
              title="Remove slide from this version"
            >
              <X size={12} className="text-gray-400 hover:text-red-600" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sub-deck share links ───────────────────────────────────────────────────
function SubDeckLinks({ subDeckId, documentId }: { subDeckId: number; documentId: number }) {
  const baseUrl = getShareBaseUrl();
  const { data: links, refetch: refetchLinks } = trpc.shareLinks.list.useQuery({ documentId });
  // Filter to links that belong to this sub-deck
  const deckLinks = (links ?? []).filter((l: any) => l.subDeckId === subDeckId);

  const createLink = trpc.shareLinks.create.useMutation({
    onSuccess: () => { toast.success("Share link created"); refetchLinks(); },
    onError: () => toast.error("Failed to create link"),
  });
  const deleteLink = trpc.shareLinks.delete.useMutation({
    onSuccess: () => { toast.success("Link deleted"); refetchLinks(); },
    onError: () => toast.error("Failed to delete link"),
  });

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`${baseUrl}/view/${slug}`);
    toast.success("Link copied");
  };

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-xs uppercase tracking-widest text-gray-500">SHARE LINKS</span>
        <button
          onClick={() => createLink.mutate({ documentId, subDeckId })}
          disabled={createLink.isPending}
          className="flex items-center gap-1 px-2 py-1 bg-[var(--color-brand)] text-black font-mono text-xs uppercase tracking-widest border border-black hover:opacity-80 disabled:opacity-50"
        >
          <Plus size={10} /> NEW LINK
        </button>
      </div>
      {deckLinks.length === 0 ? (
        <div className="border border-black p-4 text-center">
          <p className="font-mono text-xs text-gray-400 uppercase">NO LINKS YET</p>
        </div>
      ) : (
        <div className="space-y-2">
          {deckLinks.map((link: any) => (
            <div key={link.id} className="border border-black p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-mono text-xs text-gray-600 truncate">
                  {baseUrl}/view/{link.slug}
                </p>
              </div>
              <button onClick={() => copyLink(link.slug)} className="p-1 hover:bg-gray-100">
                <Copy size={12} className="text-gray-400" />
              </button>
              <a
                href={`${baseUrl}/view/${link.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 hover:bg-gray-100"
              >
                <ExternalLink size={12} className="text-gray-400" />
              </a>
              <button
                onClick={() => deleteLink.mutate({ id: link.id })}
                disabled={deleteLink.isPending}
                className="p-1 hover:bg-red-50"
              >
                <Trash2 size={12} className="text-red-400" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────
export default function SubDecksPanel({
  documentId,
  pages,
}: {
  documentId: number;
  pages: Page[];
}) {
  const utils = trpc.useUtils();
  const { data: subDecks, refetch } = trpc.subDecks.list.useQuery({ documentId });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [creatingName, setCreatingName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const createDeck = trpc.subDecks.create.useMutation({
    onSuccess: (data) => {
      toast.success("Deck created");
      setCreatingName("");
      setShowCreate(false);
      refetch();
      setExpandedId(data.id);
    },
    onError: () => toast.error("Failed to create deck"),
  });

  const deleteDeck = trpc.subDecks.delete.useMutation({
    onSuccess: () => { toast.success("Deck deleted"); refetch(); },
    onError: () => toast.error("Failed to delete deck"),
  });

  const handleCreate = () => {
    if (!creatingName.trim()) return;
    createDeck.mutate({ documentId, name: creatingName.trim() });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-mono text-xs uppercase tracking-widest text-gray-500 flex items-center gap-2">
          <Layers size={12} />
          <span>DECKS</span>
          <span className="text-gray-300">— BUILD SUB-DECKS FROM THIS MASTER</span>
        </h2>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-brand)] text-black font-mono text-xs uppercase tracking-widest border border-black hover:opacity-80"
        >
          <Plus size={10} />
          NEW DECK
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="border border-black p-3 mb-4 flex items-center gap-3 bg-gray-50">
          <input
            autoFocus
            type="text"
            value={creatingName}
            onChange={(e) => setCreatingName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="DECK NAME (e.g. Investor Short)"
            className="flex-1 font-mono text-xs uppercase tracking-widest border border-black px-2 py-1.5 bg-white focus:outline-none focus:border-[var(--color-brand)]"
          />
          <button
            onClick={handleCreate}
            disabled={createDeck.isPending || !creatingName.trim()}
            className="px-3 py-1.5 bg-black text-[var(--color-brand)] font-mono text-xs uppercase tracking-widest border border-black hover:opacity-80 disabled:opacity-50"
          >
            {createDeck.isPending ? "CREATING..." : "CREATE"}
          </button>
          <button
            onClick={() => { setShowCreate(false); setCreatingName(""); }}
            className="px-3 py-1.5 font-mono text-xs uppercase tracking-widest border border-black hover:bg-gray-100"
          >
            CANCEL
          </button>
        </div>
      )}

      {/* Deck list */}
      {!subDecks || subDecks.length === 0 ? (
        <div className="border border-black p-8 text-center">
          <div className="w-8 h-8 bg-black border border-black flex items-center justify-center mx-auto mb-3">
            <Layers size={14} className="text-[var(--color-brand)]" />
          </div>
          <p className="font-mono text-xs text-gray-400 uppercase">NO DECKS YET</p>
          <p className="font-mono text-xs text-gray-300 mt-1">
            Create a deck to save a custom slide selection from this master
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {subDecks.map((deck: any) => {
            const isExpanded = expandedId === deck.id;
            return (
              <div key={deck.id} className="border border-black">
                {/* Deck header row */}
                <div className="flex items-center gap-3 px-4 py-3 bg-white">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs font-bold uppercase tracking-widest truncate">
                      {deck.name}
                    </p>
                    {deck.description && (
                      <p className="font-mono text-xs text-gray-400 mt-0.5 truncate">{deck.description}</p>
                    )}
                    <p className="font-mono text-xs text-gray-300 mt-0.5">
                      {new Date(deck.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : deck.id)}
                    className="flex items-center gap-1 px-2 py-1 font-mono text-xs uppercase tracking-widest border border-black hover:bg-gray-50"
                  >
                    {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    {isExpanded ? "CLOSE" : "EDIT"}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete deck "${deck.name}"?`)) {
                        deleteDeck.mutate({ id: deck.id });
                        if (expandedId === deck.id) setExpandedId(null);
                      }
                    }}
                    disabled={deleteDeck.isPending}
                    className="p-1.5 hover:bg-red-50 border border-transparent hover:border-red-200"
                  >
                    <Trash2 size={12} className="text-red-400" />
                  </button>
                </div>

                {/* Expanded editor */}
                {isExpanded && (
                  <SubDeckExpanded
                    deck={deck}
                    pages={pages}
                    documentId={documentId}
                    onSaved={refetch}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Expanded deck view (loads slides lazily) ──────────────────────────────
function SubDeckExpanded({
  deck,
  pages,
  documentId,
  onSaved,
}: {
  deck: any;
  pages: Page[];
  documentId: number;
  onSaved: () => void;
}) {
  const { data: deckData } = trpc.subDecks.get.useQuery({ id: deck.id });

  return (
    <div className="border-t border-black px-4 py-4 bg-gray-50">
      <SubDeckEditor
        subDeckId={deck.id}
        pages={pages}
        initialSlides={deckData?.slides ?? []}
        onSaved={onSaved}
      />
      <SubDeckLinks subDeckId={deck.id} documentId={documentId} />
    </div>
  );
}
