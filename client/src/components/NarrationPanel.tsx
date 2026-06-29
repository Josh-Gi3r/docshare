import { useState, useRef, useCallback, DragEvent } from "react";
import { trpc } from "@/lib/trpc";
import {
  Video, GripVertical, X, Upload, Loader2, CheckCircle,
  AlertCircle, Trash2, Move, ChevronDown, ChevronUp, Plus, RefreshCw, Library,
} from "lucide-react";

interface DocumentPage {
  pageNumber: number;
  thumbnailUrl: string;
}

interface NarrationEntry {
  id: string;
  file: File;
  assignedSlot: number;
  status: "pending" | "uploading" | "done" | "error";
  videoUrl?: string;
  errorMsg?: string;
}

interface SavedNarration {
  id: number;
  pageNumber: number;
  videoUrl: string;
  cropX: number;
  cropY: number;
}

interface Props {
  documentId: number;
  pages: DocumentPage[];
  /** DB row id from documentVersions. null/undefined = master/original. */
  versionId?: number | null;
}

// ── CropAnchorEditor ────────────────────────────────────────────────────────

interface CropEditorProps {
  narration: SavedNarration;
  documentId: number;
  onSaved: (cropX: number, cropY: number) => void;
}

function CropAnchorEditor({ narration, documentId, onSaved }: CropEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cropX, setCropX] = useState(narration.cropX ?? 50);
  const [cropY, setCropY] = useState(narration.cropY ?? 50);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const updateCrop = trpc.narrations.updateCrop.useMutation({
    onSuccess: () => setIsSaving(false),
    onError: () => setIsSaving(false),
  });

  const getPercent = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    return { x, y };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    containerRef.current!.setPointerCapture(e.pointerId);
    setIsDragging(true);
    const { x, y } = getPercent(e);
    setCropX(x); setCropY(y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const { x, y } = getPercent(e);
    setCropX(x); setCropY(y);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    const { x, y } = getPercent(e);
    setCropX(x); setCropY(y);
    setIsSaving(true);
    updateCrop.mutate(
      { id: narration.id, documentId, cropX: x, cropY: y },
      { onSuccess: () => { onSaved(x, y); setIsSaving(false); } }
    );
  };

  return (
    <div className="mt-3 space-y-2">
      <p className="font-mono text-[10px] uppercase tracking-widest text-gray-500 flex items-center gap-1">
        <Move size={10} /> DRAG CROSSHAIR TO SET CROP CENTER — CIRCLE SHOWS WHAT VIEWER SEES
      </p>
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden border border-black cursor-crosshair select-none"
        style={{ aspectRatio: "16/9" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <video
          src={narration.videoUrl}
          className="w-full h-full object-cover pointer-events-none"
          muted
          preload="metadata"
        />
        {/* Dark overlay with circular cutout showing the crop zone */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle 48px at ${cropX}% ${cropY}%, transparent 46px, rgba(0,0,0,0.55) 48px)`,
          }}
        />
        {/* Crosshair dot */}
        <div
          className="absolute w-3 h-3 rounded-full border-2 border-[var(--color-brand)] pointer-events-none"
          style={{
            left: `${cropX}%`,
            top: `${cropY}%`,
            transform: "translate(-50%, -50%)",
            boxShadow: "0 0 0 2px rgba(0,0,0,0.5)",
          }}
        />
        {isSaving && (
          <div className="absolute top-2 right-2 bg-white/80 px-2 py-1 border border-black flex items-center gap-1">
            <Loader2 size={10} className="animate-spin text-black" />
            <span className="font-mono text-[10px] text-black">SAVING</span>
          </div>
        )}
      </div>
      <p className="font-mono text-[10px] text-gray-400">
        CROP POSITION: {Math.round(cropX)}% / {Math.round(cropY)}%
      </p>
    </div>
  );
}

// ── SlideSelector ────────────────────────────────────────────────────────────
// Dropdown that shows slide thumbnails for picking which slide a queued video targets

interface SlideSelectorProps {
  pages: DocumentPage[];
  value: number;
  onChange: (pageNumber: number) => void;
  takenSlots: number[]; // slots already claimed by other queued entries
  savedSlots: number[]; // slots that already have saved narrations
}

function SlideSelector({ pages, value, onChange, takenSlots, savedSlots }: SlideSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedPage = pages.find((p) => p.pageNumber === value);

  // Close on outside click
  const handleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false);
  }, []);

  return (
    <div ref={ref} className="relative flex-shrink-0" onBlur={handleBlur} tabIndex={-1}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 border border-black bg-white px-2 py-1 hover:bg-gray-50 transition-colors min-w-[90px]"
      >
        {selectedPage && (
          <img src={selectedPage.thumbnailUrl} alt={`Slide ${value}`} className="w-8 h-5 object-cover border border-gray-300 flex-shrink-0" />
        )}
        <span className="font-mono text-xs font-bold text-black">SLIDE {value}</span>
        <ChevronDown size={10} className="text-gray-400 ml-auto" />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 border border-black bg-white shadow-lg max-h-64 overflow-y-auto min-w-[160px]"
          style={{ boxShadow: "2px 2px 0 #000" }}>
          {pages.map((page) => {
            const isTaken = takenSlots.includes(page.pageNumber);
            const hasSaved = savedSlots.includes(page.pageNumber);
            return (
              <button
                key={page.pageNumber}
                type="button"
                onClick={() => { onChange(page.pageNumber); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors ${
                  page.pageNumber === value ? "bg-[var(--color-brand)]/10 border-l-2 border-[var(--color-brand)]" : ""
                }`}
              >
                <img src={page.thumbnailUrl} alt={`Slide ${page.pageNumber}`} className="w-10 h-7 object-cover border border-gray-200 flex-shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="font-mono text-xs font-bold text-black">SLIDE {page.pageNumber}</span>
                  {hasSaved && page.pageNumber !== value && (
                    <span className="font-mono text-[9px] text-orange-500">HAS NARRATION</span>
                  )}
                  {isTaken && page.pageNumber !== value && (
                    <span className="font-mono text-[9px] text-gray-400">QUEUED</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── NarrationPanel ──────────────────────────────────────────────────────────

export default function NarrationPanel({ documentId, pages, versionId }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<NarrationEntry[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [expandedCrop, setExpandedCrop] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Per-narration replace file inputs (keyed by narration id)
  const replaceInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [replacingId, setReplacingId] = useState<number | null>(null);

  const { data: savedNarrations, refetch: refetchNarrations } = trpc.narrations.list.useQuery(
    { documentId, versionId: versionId ?? null },
    { enabled: isOpen }
  );

  const deleteNarration = trpc.narrations.delete.useMutation({
    onSuccess: () => refetchNarrations(),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  // Returns the first page number that has no saved narration and is not already queued
  const nextFreeSlot = useCallback((currentEntries: NarrationEntry[], saved: SavedNarration[] | undefined): number => {
    const savedSlots = new Set((saved ?? []).map((n) => n.pageNumber));
    const queuedSlots = new Set(currentEntries.map((e) => e.assignedSlot));
    for (const page of pages) {
      if (!savedSlots.has(page.pageNumber) && !queuedSlots.has(page.pageNumber)) {
        return page.pageNumber;
      }
    }
    // All slides have narration — default to page 1
    return pages[0]?.pageNumber ?? 1;
  }, [pages]);

  // ── File handling ────────────────────────────────────────────────────────

  const addFiles = useCallback((files: File[]) => {
    const videoFiles = files.filter((f) =>
      f.type.startsWith("video/") ||
      f.name.toLowerCase().endsWith(".mp4") ||
      f.name.toLowerCase().endsWith(".mov") ||
      f.name.toLowerCase().endsWith(".webm")
    );
    if (!videoFiles.length) return;
    setEntries((prev) => {
      const next = [...prev];
      videoFiles.forEach((file) => {
        const slot = nextFreeSlot(next, savedNarrations);
        next.push({ id: `${Date.now()}-${Math.random()}`, file, assignedSlot: slot, status: "pending" });
      });
      return next;
    });
  }, [nextFreeSlot, savedNarrations]);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setIsDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const removeEntry = (id: string) =>
    setEntries((prev) => prev.filter((e) => e.id !== id));

  const updateEntrySlot = (id: string, slot: number) =>
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, assignedSlot: slot } : e));

  // ── Drag-to-reorder ──────────────────────────────────────────────────────

  const handleRowDragStart = (i: number) => setDragIndex(i);
  const handleRowDragOver = (e: DragEvent<HTMLDivElement>, i: number) => { e.preventDefault(); setDragOverIndex(i); };
  const handleRowDrop = (e: DragEvent<HTMLDivElement>, target: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === target) return;
    setEntries((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(target, 0, moved);
      return next;
    });
    setDragIndex(null); setDragOverIndex(null);
  };
  const handleRowDragEnd = () => { setDragIndex(null); setDragOverIndex(null); };

  // ── Upload ───────────────────────────────────────────────────────────────

  const handleSave = async () => {
    const pending = entries.filter((e) => e.status === "pending");
    if (!pending.length) return;
    setIsSaving(true);
    for (const entry of pending) {
      setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, status: "uploading" } : e));
      try {
        const form = new FormData();
        form.append("file", entry.file);
        form.append("documentId", String(documentId));
        form.append("pageNumber", String(entry.assignedSlot));
        if (versionId != null) form.append("versionId", String(versionId));
        const res = await fetch("/api/upload-narration", { method: "POST", body: form, credentials: "include" });
        if (!res.ok) { const err = await res.json().catch(() => ({ error: "Upload failed" })); throw new Error(err.error || "Upload failed"); }
        const data = await res.json();
        setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, status: "done", videoUrl: data.videoUrl } : e));
      } catch (err: any) {
        setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, status: "error", errorMsg: err.message } : e));
      }
    }
    setIsSaving(false);
    refetchNarrations();
    setTimeout(() => setEntries((prev) => prev.filter((e) => e.status !== "done")), 2000);
  };

  // ── Replace a specific saved narration ───────────────────────────────────

  const handleReplaceFile = async (narrationId: number, pageNumber: number, file: File) => {
    setReplacingId(narrationId);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("documentId", String(documentId));
      form.append("pageNumber", String(pageNumber));
      if (versionId != null) form.append("versionId", String(versionId));
      const res = await fetch("/api/upload-narration", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "Upload failed" })); throw new Error(err.error || "Upload failed"); }
      refetchNarrations();
    } catch (err: any) {
      alert(`Replace failed: ${err.message}`);
    } finally {
      setReplacingId(null);
    }
  };

  const hasPending = entries.some((e) => e.status === "pending");
  const savedSlots = (savedNarrations ?? []).map((n) => n.pageNumber);
  const queuedSlots = entries.map((e) => e.assignedSlot);

  // ── Library picker state ─────────────────────────────────────────────────
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [librarySlot, setLibrarySlot] = useState<number>(pages[0]?.pageNumber ?? 1);
  const [libraryPickId, setLibraryPickId] = useState<number | null>(null);

  const { data: libraryItems, refetch: refetchLibrary } = trpc.mediaLibrary.list.useQuery(
    { type: "narration" },
    { enabled: libraryOpen }
  );

  const addFromLibrary = trpc.mediaLibrary.addNarrationFromLibrary.useMutation({
    onSuccess: () => {
      refetchNarrations();
      setLibraryOpen(false);
      setLibraryPickId(null);
    },
  });

  const libraryUploadRef = useRef<HTMLInputElement>(null);
  const [libraryUploading, setLibraryUploading] = useState(false);

  const handleLibraryUpload = async (file: File) => {
    setLibraryUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("type", "narration");
      form.append("label", file.name);
      const res = await fetch("/api/upload-to-library", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      refetchLibrary();
    } catch (err: any) {
      alert(`Library upload failed: ${err.message}`);
    } finally {
      setLibraryUploading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="border border-black bg-white" style={{ boxShadow: "2px 2px 0 #000" }}>

      {/* ── Header (always visible) ── */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Video size={16} className="text-[var(--color-brand)] flex-shrink-0" style={{ filter: "drop-shadow(0 0 4px var(--color-brand))" }} />
          <span className="font-mono text-sm font-bold uppercase tracking-widest text-black">
            SLIDE NARRATION
          </span>
          {savedNarrations && savedNarrations.length > 0 ? (
            <span className="font-mono text-xs text-[var(--color-brand)] border border-[var(--color-brand)] px-1.5 py-0.5">
              {savedNarrations.length} VIDEO{savedNarrations.length !== 1 ? "S" : ""}
            </span>
          ) : (
            <span className="font-mono text-xs text-gray-400">ADD VOICE-OVER PER SLIDE</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isOpen && (
            <span className="hidden sm:flex items-center gap-1 font-mono text-xs text-gray-400 border border-gray-300 px-2 py-1">
              <Plus size={10} /> ADD VIDEOS
            </span>
          )}
          {isOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        </div>
      </button>

      {/* ── Expanded body ── */}
      {isOpen && (
        <div className="border-t border-black px-5 pb-6 pt-5 space-y-6">

          {/* Saved narrations */}
          {savedNarrations && savedNarrations.length > 0 && (
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-widest text-gray-500">
                SAVED NARRATIONS — CLICK CROP TO ADJUST CIRCULAR FRAMING
              </p>
              {savedNarrations.map((n) => {
                const page = pages.find((p) => p.pageNumber === n.pageNumber);
                const isCropOpen = expandedCrop === n.id;
                const isReplacing = replacingId === n.id;
                return (
                  <div key={n.id} className="border border-black bg-white">
                    <div className="flex items-center gap-3 px-3 py-2">
                      {page && (
                        <img src={page.thumbnailUrl} alt={`Slide ${n.pageNumber}`}
                          className="w-12 h-8 object-cover border border-black flex-shrink-0" />
                      )}
                      <span className="font-mono text-xs font-bold text-black flex-1">
                        SLIDE {n.pageNumber}
                      </span>
                      {/* Circular crop preview */}
                      <div
                        className="w-9 h-9 rounded-full overflow-hidden border-2 border-black flex-shrink-0 cursor-pointer"
                        title="Click CROP to adjust framing"
                        onClick={() => setExpandedCrop(isCropOpen ? null : n.id)}
                      >
                        <video
                          src={n.videoUrl}
                          className="w-full h-full"
                          style={{ objectFit: "cover", objectPosition: `${n.cropX ?? 50}% ${n.cropY ?? 50}%` }}
                          muted preload="metadata"
                        />
                      </div>
                      {/* REPLACE button */}
                      <button
                        onClick={() => replaceInputRefs.current[n.id]?.click()}
                        disabled={isReplacing}
                        className="font-mono text-xs px-2 py-1 border border-black bg-white hover:bg-gray-100 transition-colors flex items-center gap-1 flex-shrink-0 disabled:opacity-50"
                        title={`Replace narration for slide ${n.pageNumber}`}
                      >
                        {isReplacing ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                        REPLACE
                      </button>
                      <input
                        ref={(el) => { replaceInputRefs.current[n.id] = el; }}
                        type="file"
                        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleReplaceFile(n.id, n.pageNumber, file);
                          e.target.value = "";
                        }}
                      />
                      <button
                        onClick={() => setExpandedCrop(isCropOpen ? null : n.id)}
                        className={`font-mono text-xs px-2 py-1 border transition-colors flex-shrink-0 ${
                          isCropOpen
                            ? "bg-black text-white border-black"
                            : "bg-white text-black border-black hover:bg-gray-100"
                        }`}
                      >
                        CROP
                      </button>
                      <button
                        onClick={() => deleteNarration.mutate({ id: n.id, documentId })}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1 flex-shrink-0"
                        title="Remove narration"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {isCropOpen && (
                      <div className="border-t border-black px-3 pb-3">
                        <CropAnchorEditor
                          narration={n}
                          documentId={documentId}
                          onSaved={() => refetchNarrations()}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Drop zone */}
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-gray-500 mb-2">
              {savedNarrations && savedNarrations.length > 0 ? "ADD NARRATION FOR MORE SLIDES" : "UPLOAD NARRATION VIDEOS"}
            </p>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed cursor-pointer flex flex-col items-center justify-center py-10 px-4 transition-colors ${
                isDragOver ? "border-[var(--color-brand)] bg-[var(--color-brand)]/5" : "border-gray-300 hover:border-black hover:bg-gray-50"
              }`}
            >
              <div className={`w-12 h-12 border-2 flex items-center justify-center mb-3 ${isDragOver ? "border-[var(--color-brand)]" : "border-gray-300"}`}>
                <Upload size={20} className={isDragOver ? "text-[var(--color-brand)]" : "text-gray-400"} />
              </div>
              <p className="font-mono text-sm font-bold uppercase tracking-widest text-black">
                DROP VIDEO FILES HERE
              </p>
              <p className="mt-1 font-mono text-xs text-gray-500 text-center">
                OR CLICK TO BROWSE · MP4, MOV, WEBM
              </p>
              <p className="mt-2 font-mono text-xs text-gray-400 text-center max-w-sm">
                EACH FILE WILL BE ASSIGNED TO THE NEXT FREE SLIDE — USE THE SLIDE SELECTOR TO CHANGE THE TARGET
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                multiple
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
            {/* FROM LIBRARY button */}
            <button
              type="button"
              onClick={() => setLibraryOpen(true)}
              className="mt-2 w-full flex items-center justify-center gap-2 border border-black bg-white px-4 py-2.5 font-mono text-xs uppercase tracking-widest hover:bg-gray-50 transition-colors"
            >
              <Library size={12} /> FROM LIBRARY
            </button>
          </div>

          {/* Library picker modal */}
          {libraryOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/60" onClick={() => setLibraryOpen(false)} />
              <div className="relative bg-white border border-black w-full max-w-lg mx-4 flex flex-col" style={{ boxShadow: "4px 4px 0 #000", maxHeight: "80vh" }}>
                {/* Modal header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-black flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Library size={14} className="text-[var(--color-brand)]" />
                    <span className="font-mono text-sm font-bold uppercase tracking-widest text-black">NARRATION LIBRARY</span>
                  </div>
                  <button onClick={() => setLibraryOpen(false)} className="text-gray-400 hover:text-black"><X size={16} /></button>
                </div>

                {/* Slide selector */}
                <div className="px-5 py-3 border-b border-gray-200 flex-shrink-0 flex items-center gap-3">
                  <span className="font-mono text-xs text-gray-500 uppercase tracking-widest">ASSIGN TO:</span>
                  <SlideSelector
                    pages={pages}
                    value={librarySlot}
                    onChange={setLibrarySlot}
                    takenSlots={queuedSlots}
                    savedSlots={savedSlots}
                  />
                </div>

                {/* Library items */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
                  {!libraryItems || libraryItems.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="font-mono text-xs text-gray-400 uppercase tracking-widest">NO NARRATIONS IN LIBRARY YET</p>
                      <p className="font-mono text-xs text-gray-300 mt-1">Upload a file below to add it to your library</p>
                    </div>
                  ) : (
                    libraryItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setLibraryPickId(item.id === libraryPickId ? null : item.id)}
                        className={`w-full flex items-center gap-3 border px-3 py-2.5 text-left transition-colors ${
                          libraryPickId === item.id ? "border-[var(--color-brand)] bg-[var(--color-brand)]/5" : "border-black hover:bg-gray-50"
                        }`}
                      >
                        <div className="w-12 h-9 rounded-full overflow-hidden border border-black flex-shrink-0">
                          <video src={item.videoUrl} className="w-full h-full object-cover" muted preload="metadata" />
                        </div>
                        <span className="font-mono text-xs font-bold text-black flex-1 truncate">{item.label}</span>
                        {libraryPickId === item.id && (
                          <CheckCircle size={14} className="text-[var(--color-brand)] flex-shrink-0" />
                        )}
                      </button>
                    ))
                  )}
                </div>

                {/* Upload to library */}
                <div className="px-5 py-3 border-t border-gray-200 flex-shrink-0">
                  <button
                    type="button"
                    disabled={libraryUploading}
                    onClick={() => libraryUploadRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 border border-dashed border-gray-400 py-2 font-mono text-xs uppercase tracking-widest text-gray-500 hover:border-black hover:text-black transition-colors disabled:opacity-50"
                  >
                    {libraryUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                    {libraryUploading ? "UPLOADING..." : "UPLOAD NEW TO LIBRARY"}
                  </button>
                  <input
                    ref={libraryUploadRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLibraryUpload(f); e.target.value = ""; }}
                  />
                </div>

                {/* Confirm button */}
                <div className="px-5 py-4 border-t border-black flex-shrink-0">
                  <button
                    type="button"
                    disabled={libraryPickId === null || addFromLibrary.isPending}
                    onClick={() => {
                      if (libraryPickId !== null) {
                        addFromLibrary.mutate({ documentId, pageNumber: librarySlot, mediaLibraryItemId: libraryPickId });
                      }
                    }}
                    className="w-full py-3 bg-black text-white font-mono text-sm uppercase tracking-widest border border-black hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ boxShadow: libraryPickId !== null ? "2px 2px 0 var(--color-brand)" : "none" }}
                  >
                    {addFromLibrary.isPending && <Loader2 size={14} className="animate-spin" />}
                    {addFromLibrary.isPending ? "ADDING..." : "ADD TO SLIDE"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Ordered list */}
          {entries.length > 0 && (
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-widest text-gray-500">
                {entries.length} FILE{entries.length !== 1 ? "S" : ""} QUEUED — PICK TARGET SLIDE, THEN SAVE
              </p>
              {entries.map((entry, index) => {
                const isDraggingThis = dragIndex === index;
                const isDropTarget = dragOverIndex === index && dragIndex !== index;
                // Other queued entries' slots (excluding this one)
                const otherQueuedSlots = entries
                  .filter((e) => e.id !== entry.id)
                  .map((e) => e.assignedSlot);
                return (
                  <div
                    key={entry.id}
                    draggable
                    onDragStart={() => handleRowDragStart(index)}
                    onDragOver={(e) => handleRowDragOver(e, index)}
                    onDrop={(e) => handleRowDrop(e, index)}
                    onDragEnd={handleRowDragEnd}
                    className={`flex items-center gap-3 border px-3 py-2.5 bg-white transition-all select-none ${
                      isDraggingThis ? "opacity-40 border-gray-300" : isDropTarget ? "border-[var(--color-brand)] bg-[var(--color-brand)]/5" : "border-black"
                    }`}
                  >
                    <GripVertical size={14} className="text-gray-400 cursor-grab flex-shrink-0" />

                    {/* Slide selector dropdown */}
                    {entry.status === "pending" ? (
                      <SlideSelector
                        pages={pages}
                        value={entry.assignedSlot}
                        onChange={(slot) => updateEntrySlot(entry.id, slot)}
                        takenSlots={otherQueuedSlots}
                        savedSlots={savedSlots}
                      />
                    ) : (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {pages.find((p) => p.pageNumber === entry.assignedSlot) && (
                          <img
                            src={pages.find((p) => p.pageNumber === entry.assignedSlot)!.thumbnailUrl}
                            alt={`Slide ${entry.assignedSlot}`}
                            className="w-8 h-5 object-cover border border-gray-300"
                          />
                        )}
                        <span className="font-mono text-xs font-bold text-black w-16">SLIDE {entry.assignedSlot}</span>
                      </div>
                    )}

                    <span className="font-mono text-xs text-gray-600 flex-1 truncate">
                      {entry.file.name}
                    </span>
                    <div className="flex-shrink-0">
                      {entry.status === "uploading" && <Loader2 size={14} className="text-black animate-spin" />}
                      {entry.status === "done" && <CheckCircle size={14} className="text-[var(--color-brand)]" />}
                      {entry.status === "error" && (
                        <span className="font-mono text-[10px] text-red-500 flex items-center gap-1">
                          <AlertCircle size={12} /> FAILED
                        </span>
                      )}
                    </div>
                    {entry.status === "pending" && (
                      <button onClick={() => removeEntry(entry.id)} className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                );
              })}

              {hasPending && (
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full mt-2 py-3 bg-black text-white font-mono text-sm uppercase tracking-widest border border-black hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ boxShadow: "2px 2px 0 var(--color-brand)" }}
                >
                  {isSaving && <Loader2 size={14} className="animate-spin" />}
                  {isSaving
                    ? "UPLOADING..."
                    : `SAVE NARRATION — ${entries.filter((e) => e.status === "pending").length} FILE${entries.filter((e) => e.status === "pending").length !== 1 ? "S" : ""}`}
                </button>
              )}
            </div>
          )}

          {/* Empty state */}
          {entries.length === 0 && (!savedNarrations || savedNarrations.length === 0) && (
            <div className="border border-dashed border-gray-200 p-6 text-center">
              <p className="font-mono text-xs text-gray-400 uppercase tracking-widest">
                NO NARRATION VIDEOS YET
              </p>
              <p className="font-mono text-xs text-gray-300 mt-1">
                Use the drop zone above to add voice-over videos to your slides
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
