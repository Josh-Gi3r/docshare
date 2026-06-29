import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  FileVideo,
  History,
  Link2,
  Mic,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";


type MediaLibraryItem = {
  id: number;
  label: string;
  videoUrl: string;
  videoKey: string;
  type: string;
  durationSeconds?: number | null;
  createdAt: Date;
};

function formatDuration(seconds?: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Version History Panel ────────────────────────────────────────────────────
function VersionHistoryPanel({
  item,
  onClose,
}: {
  item: MediaLibraryItem;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: versions, isLoading } = trpc.mediaLibrary.getVersions.useQuery(
    { mediaLibraryId: item.id },
    { enabled: true }
  );

  const rollback = trpc.mediaLibrary.rollbackToVersion.useMutation({
    onSuccess: () => {
      toast.success("Rolled back: All linked slides updated to this version.");
      utils.mediaLibrary.list.invalidate();
      utils.mediaLibrary.getVersions.invalidate({ mediaLibraryId: item.id });
    },
    onError: () => toast.error("Rollback failed"),
  });

  const [uploading, setUploading] = useState(false);

  async function handleNewVersion(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Upload to S3 via the library upload endpoint
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "narration");
      formData.append("label", item.label);
      const res = await fetch("/api/upload-to-library", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      const { videoUrl, videoKey } = await res.json();

      // Register as a new version on the existing library item
      await utils.client.mediaLibrary.addVersion.mutate({
        mediaLibraryId: item.id,
        videoUrl,
        videoKey,
        fileSizeBytes: file.size,
      });

      toast.success("New version uploaded: All linked slides have been updated automatically.");
      utils.mediaLibrary.list.invalidate();
      utils.mediaLibrary.getVersions.invalidate({ mediaLibraryId: item.id });
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
          Version History — {item.label}
        </h3>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Upload className="h-3.5 w-3.5 mr-1.5" />
            )}
            Upload New Version
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleNewVersion}
          />
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading versions…</p>
      ) : !versions?.length ? (
        <p className="text-sm text-muted-foreground">No version history yet.</p>
      ) : (
        <div className="space-y-2">
          {versions.map((v, idx) => (
            <div
              key={v.id}
              className="flex items-center justify-between p-3 rounded-lg border bg-card"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-xs font-bold">
                  v{v.versionNumber}
                </div>
                <div>
                  <p className="text-sm font-medium">
                    Version {v.versionNumber}
                    {idx === 0 && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        Current
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(v.createdAt)}
                    {v.fileSizeBytes
                      ? ` · ${(v.fileSizeBytes / 1024 / 1024).toFixed(1)} MB`
                      : ""}
                  </p>
                </div>
              </div>
              {idx !== 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    rollback.mutate({ mediaLibraryId: item.id, versionId: v.id })
                  }
                  disabled={rollback.isPending}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Restore
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Usage Map Panel ──────────────────────────────────────────────────────────
function UsageMapPanel({
  item,
  onClose,
}: {
  item: MediaLibraryItem;
  onClose: () => void;
}) {
  const { data: usages, isLoading } = trpc.mediaLibrary.getUsages.useQuery({
    mediaLibraryId: item.id,
  });

  // Group by document
  const grouped = (usages ?? []).reduce(
    (acc, u) => {
      const key = `${u.documentId}`;
      if (!acc[key]) acc[key] = { documentId: u.documentId, title: u.documentTitle, pages: [] };
      acc[key].pages.push(u.pageNumber);
      return acc;
    },
    {} as Record<string, { documentId: number; title: string; pages: number[] }>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
          Used In — {item.label}
        </h3>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading usages…</p>
      ) : Object.keys(grouped).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This narration is not attached to any slides yet.
        </p>
      ) : (
        <div className="space-y-2">
          {Object.values(grouped).map((doc) => (
            <div key={doc.documentId} className="p-3 rounded-lg border bg-card">
              <p className="text-sm font-medium">{doc.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Slides: {doc.pages.sort((a, b) => a - b).join(", ")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Attach to Slide Dialog ───────────────────────────────────────────────────
function AttachToSlideDialog({
  item,
  open,
  onClose,
}: {
  item: MediaLibraryItem;
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [selectedPage, setSelectedPage] = useState<string>("");

  const { data: docs } = trpc.documents.list.useQuery(undefined, { enabled: open });
  const selectedDoc = docs?.find((d) => d.id === parseInt(selectedDocId));

  const attach = trpc.mediaLibrary.addNarrationFromLibrary.useMutation({
    onSuccess: () => {
      toast.success(`Narration attached to slide ${selectedPage} of "${selectedDoc?.title}".`);
      utils.mediaLibrary.getUsages.invalidate({ mediaLibraryId: item.id });
      onClose();
    },
    onError: () => toast.error("Attach failed"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Attach to Slide</DialogTitle>
          <DialogDescription>
            Attach "{item.label}" to a specific slide in one of your documents.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Document</label>
            <Select value={selectedDocId} onValueChange={(v) => { setSelectedDocId(v); setSelectedPage(""); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select a document…" />
              </SelectTrigger>
              <SelectContent>
                {(docs ?? []).map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedDoc && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Slide number</label>
              <Select value={selectedPage} onValueChange={setSelectedPage}>
                <SelectTrigger>
                  <SelectValue placeholder="Select slide…" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: selectedDoc.pageCount ?? 1 }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      Slide {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!selectedDocId || !selectedPage || attach.isPending}
              onClick={() =>
                attach.mutate({
                  documentId: parseInt(selectedDocId),
                  pageNumber: parseInt(selectedPage),
                  mediaLibraryItemId: item.id,
                })
              }
            >
              {attach.isPending ? "Attaching…" : "Attach"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Narration Card ───────────────────────────────────────────────────────────
function NarrationCard({
  item,
  onDeleted,
}: {
  item: MediaLibraryItem;
  onDeleted: () => void;
}) {
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState<"versions" | "usages" | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);

  const deleteMutation = trpc.mediaLibrary.delete.useMutation({
    onSuccess: () => {
      toast.success("Narration deleted");
      onDeleted();
    },
    onError: () => toast.error("Delete failed"),
  });

  const { data: usages } = trpc.mediaLibrary.getUsages.useQuery({ mediaLibraryId: item.id });
  const usageCount = usages?.length ?? 0;

  return (
    <>
      <Card className="border shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Mic className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm font-semibold truncate">{item.label}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(item.createdAt)}
                  {item.durationSeconds ? ` · ${formatDuration(item.durationSeconds)}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Badge variant={usageCount > 0 ? "default" : "secondary"} className="text-xs">
                {usageCount} slide{usageCount !== 1 ? "s" : ""}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-3">
          {/* Video preview */}
          <video
            src={item.videoUrl}
            className="w-full rounded-md aspect-video object-cover bg-black/5"
            controls
            preload="metadata"
          />

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 min-w-[120px]"
              onClick={() => setAttachOpen(true)}
            >
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              Attach to Slide
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setExpanded(expanded === "versions" ? null : "versions")}
            >
              <History className="h-3.5 w-3.5 mr-1.5" />
              Versions
              {expanded === "versions" ? (
                <ChevronDown className="h-3 w-3 ml-1" />
              ) : (
                <ChevronRight className="h-3 w-3 ml-1" />
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setExpanded(expanded === "usages" ? null : "usages")}
            >
              <FileVideo className="h-3.5 w-3.5 mr-1.5" />
              Used In
              {expanded === "usages" ? (
                <ChevronDown className="h-3 w-3 ml-1" />
              ) : (
                <ChevronRight className="h-3 w-3 ml-1" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (confirm(`Delete "${item.label}"? This will not affect slides already using it.`))
                  deleteMutation.mutate({ id: item.id });
              }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Expandable panels */}
          {expanded === "versions" && (
            <div className="pt-2 border-t">
              <VersionHistoryPanel item={item} onClose={() => setExpanded(null)} />
            </div>
          )}
          {expanded === "usages" && (
            <div className="pt-2 border-t">
              <UsageMapPanel item={item} onClose={() => setExpanded(null)} />
            </div>
          )}
        </CardContent>
      </Card>

      <AttachToSlideDialog
        item={item}
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
      />
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function NarrationLibrary() {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: items, isLoading, refetch } = trpc.mediaLibrary.list.useQuery({ type: "narration" });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "narration");
      formData.append("label", file.name.replace(/\.[^/.]+$/, ""));
      const res = await fetch("/api/upload-to-library", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      toast.success("Narration uploaded: Added to your library.");
      utils.mediaLibrary.list.invalidate();
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Narration Library</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Upload narration videos once, attach them to any slide. Update a version and all linked slides update automatically.
            </p>
          </div>
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            {uploading ? "Uploading…" : "Upload Narration"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleUpload}
          />
        </div>

        {/* Stats bar */}
        {items && items.length > 0 && (
          <div className="flex gap-6 p-4 rounded-lg border bg-muted/30">
            <div className="text-center">
              <p className="text-2xl font-bold">{items.length}</p>
              <p className="text-xs text-muted-foreground">Narrations</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">
                <Clock className="h-5 w-5 inline-block" />
              </p>
              <p className="text-xs text-muted-foreground">Versioned</p>
            </div>
          </div>
        )}

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 rounded-lg border bg-muted/20 animate-pulse" />
            ))}
          </div>
        ) : !items?.length ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Mic className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold">No narrations yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Upload your first narration video. Once uploaded, you can attach it to any slide across all your documents.
            </p>
            <Button className="mt-6" onClick={() => fileRef.current?.click()}>
              <Plus className="h-4 w-4 mr-2" />
              Upload Narration
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <NarrationCard
                key={item.id}
                item={item as MediaLibraryItem}
                onDeleted={() => utils.mediaLibrary.list.invalidate()}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
