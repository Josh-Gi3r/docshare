import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  ChevronLeft,
  GripVertical,
  Layers,
  Mic,
  MicOff,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { toast } from "sonner";

type SlotDraft = {
  id: string; // local draft id
  documentPageId: number;
  pageNumber: number;
  thumbnailUrl: string;
  sourceDocTitle: string;
  narrationAssetId: number | null;
  narrationLabel: string | null;
};

export default function DeckComposer() {
  const { folderId: folderIdStr, deckId: deckIdStr } = useParams<{ folderId: string; deckId: string }>();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const preselectedDocId = params.get("docId") ? parseInt(params.get("docId")!, 10) : null;

  const folderId = parseInt(folderIdStr, 10);
  const isNew = deckIdStr === "new";
  const deckId = isNew ? null : parseInt(deckIdStr, 10);

  const [, setLocation] = useLocation();
  const [deckName, setDeckName] = useState("");
  const [deckDesc, setDeckDesc] = useState("");
  const [slots, setSlots] = useState<SlotDraft[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedDeckId, setSavedDeckId] = useState<number | null>(deckId);

  // Slide picker state
  const [showPicker, setShowPicker] = useState(false);
  const [pickerDocId, setPickerDocId] = useState<number | null>(preselectedDocId);

  // Narration picker state
  const [narrationSlotId, setNarrationSlotId] = useState<string | null>(null);

  // Drag state
  const dragIndex = useRef<number | null>(null);

  const { data: folder, isLoading: folderLoading } = trpc.folders.get.useQuery({ id: folderId });
  const { data: existingDeck, isLoading: deckLoading } = trpc.composedDecks.get.useQuery(
    { id: deckId! },
    { enabled: !!deckId }
  );
  const { data: narrations } = trpc.narrationAssets.list.useQuery({ folderId });

  const createDeckMutation = trpc.composedDecks.create.useMutation();
  const updateDeckMutation = trpc.composedDecks.update.useMutation();
  const saveSlotsMutation = trpc.composedDecks.saveSlots.useMutation();

  // Load existing deck into state
  useEffect(() => {
    if (existingDeck) {
      setDeckName(existingDeck.name);
      setDeckDesc(existingDeck.description ?? "");
      setSlots(
        existingDeck.slots.map((s: any) => ({
          id: `slot-${s.id}`,
          documentPageId: s.documentPageId,
          pageNumber: s.page?.pageNumber ?? s.position,
          thumbnailUrl: s.page?.thumbnailUrl ?? "",
          sourceDocTitle: "",
          narrationAssetId: s.narrationAssetId ?? null,
          narrationLabel: null,
        }))
      );
    }
  }, [existingDeck]);

  const handleSave = async () => {
    if (!deckName.trim()) { toast.error("Give your deck a name first."); return; }
    if (slots.length === 0) { toast.error("Add at least one slide."); return; }
    setIsSaving(true);
    try {
      let targetDeckId = savedDeckId;
      if (!targetDeckId) {
        const result = await createDeckMutation.mutateAsync({ folderId, name: deckName.trim(), description: deckDesc.trim() || undefined });
        targetDeckId = result.id;
        setSavedDeckId(targetDeckId);
      } else {
        await updateDeckMutation.mutateAsync({ id: targetDeckId, name: deckName.trim(), description: deckDesc.trim() || undefined });
      }
      await saveSlotsMutation.mutateAsync({
        deckId: targetDeckId!,
        slots: slots.map((s, i) => ({
          position: i + 1,
          documentPageId: s.documentPageId,
          narrationAssetId: s.narrationAssetId ?? undefined,
        })),
      });
      setIsDirty(false);
      toast.success("Deck saved.");
      if (isNew) {
        setLocation(`/compose/${folderId}/${targetDeckId}`);
      }
    } catch (e: any) {
      toast.error(e.message || "Save failed.");
    } finally {
      setIsSaving(false);
    }
  };

  const addSlide = (page: any, docTitle: string) => {
    setSlots((prev) => [
      ...prev,
      {
        id: `draft-${Date.now()}-${page.id}`,
        documentPageId: page.id,
        pageNumber: page.pageNumber,
        thumbnailUrl: page.thumbnailUrl,
        sourceDocTitle: docTitle,
        narrationAssetId: null,
        narrationLabel: null,
      },
    ]);
    setIsDirty(true);
  };

  const removeSlot = (id: string) => {
    setSlots((prev) => prev.filter((s) => s.id !== id));
    setIsDirty(true);
  };

  const assignNarration = (slotId: string, narrationId: number | null, label: string | null) => {
    setSlots((prev) =>
      prev.map((s) => s.id === slotId ? { ...s, narrationAssetId: narrationId, narrationLabel: label } : s)
    );
    setNarrationSlotId(null);
    setIsDirty(true);
  };

  // Simple drag-to-reorder
  const handleDragStart = (index: number) => { dragIndex.current = index; };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex.current === null || dragIndex.current === index) return;
    const newSlots = [...slots];
    const [moved] = newSlots.splice(dragIndex.current, 1);
    newSlots.splice(index, 0, moved);
    dragIndex.current = index;
    setSlots(newSlots);
    setIsDirty(true);
  };
  const handleDragEnd = () => { dragIndex.current = null; };

  const isLoading = folderLoading || (!!deckId && deckLoading);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="max-w-6xl mx-auto py-6 px-4">
          <div className="h-8 w-48 bg-muted rounded animate-pulse mb-6" />
          <div className="h-64 bg-muted rounded animate-pulse" />
        </div>
      </DashboardLayout>
    );
  }

  const pickerDoc = folder?.documents?.find((d: any) => d.id === pickerDocId);

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto py-6 px-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 -ml-2 text-muted-foreground"
            onClick={() => setLocation(`/folders/${folderId}`)}
          >
            <ChevronLeft className="h-4 w-4" />
            {folder?.name ?? "Folder"}
          </Button>
        </div>

        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex-1 min-w-0 space-y-2">
            <Input
              className="text-xl font-semibold border-0 border-b rounded-none px-0 focus-visible:ring-0 bg-transparent"
              placeholder="Deck name..."
              value={deckName}
              onChange={(e) => { setDeckName(e.target.value); setIsDirty(true); }}
            />
            <Input
              className="text-sm text-muted-foreground border-0 border-b rounded-none px-0 focus-visible:ring-0 bg-transparent"
              placeholder="Description (optional)"
              value={deckDesc}
              onChange={(e) => { setDeckDesc(e.target.value); setIsDirty(true); }}
            />
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setShowPicker(true)}
            >
              <Plus className="h-4 w-4" />
              Add Slides
            </Button>
            <Button
              size="sm"
              className="gap-2"
              disabled={isSaving || !isDirty}
              onClick={handleSave}
            >
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : isDirty ? "Save" : "Saved"}
            </Button>
          </div>
        </div>

        {/* Slot list */}
        {slots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed rounded-lg">
            <Layers className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-medium mb-1">No slides yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              Click "Add Slides" to pick slides from the folder's document library.
            </p>
            <Button variant="outline" onClick={() => setShowPicker(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Slides
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {slots.map((slot, index) => (
              <div
                key={slot.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className="flex items-center gap-3 p-3 border rounded-lg bg-card hover:bg-accent/30 transition-colors cursor-grab active:cursor-grabbing group"
              >
                {/* Drag handle */}
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />

                {/* Position */}
                <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{index + 1}</span>

                {/* Thumbnail */}
                <img
                  src={slot.thumbnailUrl}
                  alt={`Slide ${slot.pageNumber}`}
                  className="h-14 w-auto rounded border object-cover shrink-0"
                />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {slot.sourceDocTitle ? `${slot.sourceDocTitle} · ` : ""}Slide {slot.pageNumber}
                  </p>
                  {slot.narrationAssetId ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Mic className="h-3 w-3 text-green-500" />
                      <span className="text-xs text-green-600">{slot.narrationLabel || `Narration #${slot.narrationAssetId}`}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 mt-0.5">
                      <MicOff className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">No narration</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => setNarrationSlotId(slot.id)}
                  >
                    <Mic className="h-3.5 w-3.5" />
                    {slot.narrationAssetId ? "Change" : "Add Narration"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeSlot(slot.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}

            {/* Add more */}
            <button
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
              onClick={() => setShowPicker(true)}
            >
              <Plus className="h-4 w-4" />
              Add more slides
            </button>
          </div>
        )}
      </div>

      {/* Slide Picker Dialog */}
      <Dialog open={showPicker} onOpenChange={setShowPicker}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Slides</DialogTitle>
          </DialogHeader>
          <div className="flex gap-3 flex-1 min-h-0 overflow-hidden">
            {/* Document list */}
            <div className="w-48 shrink-0 border-r pr-3 overflow-y-auto space-y-1">
              {folder?.documents?.map((doc: any) => (
                <button
                  key={doc.id}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${pickerDocId === doc.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                  onClick={() => setPickerDocId(doc.id)}
                >
                  <p className="font-medium truncate">{doc.title}</p>
                  <p className="text-xs opacity-70">{doc.pages?.length ?? 0} slides</p>
                </button>
              ))}
            </div>

            {/* Slide grid */}
            <div className="flex-1 overflow-y-auto">
              {pickerDoc ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {pickerDoc.pages?.map((page: any) => (
                    <button
                      key={page.id}
                      className="relative group rounded border overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                      onClick={() => { addSlide(page, pickerDoc.title); }}
                    >
                      <img
                        src={page.thumbnailUrl}
                        alt={`Slide ${page.pageNumber}`}
                        className="w-full h-auto object-cover"
                      />
                      <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/10 transition-colors flex items-center justify-center">
                        <Plus className="h-6 w-6 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] text-center py-0.5">
                        {page.pageNumber}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Select a document on the left.
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPicker(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Narration Picker Dialog */}
      <Dialog open={!!narrationSlotId} onOpenChange={(open) => { if (!open) setNarrationSlotId(null); }}>
        <DialogContent className="sm:max-w-md max-h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Assign Narration</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 py-2">
            <button
              className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-accent text-left transition-colors"
              onClick={() => assignNarration(narrationSlotId!, null, null)}
            >
              <MicOff className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">No narration</span>
            </button>
            {narrations && narrations.length > 0 ? (
              narrations.map((n: any) => (
                <button
                  key={n.id}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-accent text-left transition-colors ${slots.find(s => s.id === narrationSlotId)?.narrationAssetId === n.id ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => assignNarration(narrationSlotId!, n.id, n.label || `Narration #${n.id}`)}
                >
                  <Mic className="h-4 w-4 text-green-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{n.label || `Narration #${n.id}`}</p>
                    {n.documentId && (
                      <p className="text-xs text-muted-foreground">Linked to Slide {n.pageNumber} · Doc #{n.documentId}</p>
                    )}
                    {n.durationSeconds && (
                      <p className="text-xs text-muted-foreground">{Math.round(n.durationSeconds)}s</p>
                    )}
                  </div>
                  {slots.find(s => s.id === narrationSlotId)?.narrationAssetId === n.id && (
                    <Badge variant="default" className="ml-auto text-xs">Current</Badge>
                  )}
                </button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No narrations in this folder yet. Upload narrations via the document detail page, then they will appear here.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNarrationSlotId(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
