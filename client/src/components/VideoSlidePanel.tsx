import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trash2, Upload, Video, Loader2 } from "lucide-react";

interface VideoSlidePanelProps {
  documentId: number;
  pages: Array<{ pageNumber: number; thumbnailUrl?: string | null }>;
}

interface UploadQueueItem {
  file: File;
  pageNumber: number;
  status: "pending" | "uploading" | "done" | "error";
  errorMsg?: string;
  resultUrl?: string;
}

export default function VideoSlidePanel({ documentId, pages }: VideoSlidePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [selectedPage, setSelectedPage] = useState<number>(1);

  const { data: videoSlides = [], refetch } = trpc.videoSlides.list.useQuery({ documentId });
  const deleteVideoSlide = trpc.videoSlides.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Video slide removed"); },
    onError: () => toast.error("Delete failed"),
  });

  const formatDuration = (secs?: number | null) => {
    if (!secs) return "";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const addFiles = (files: File[]) => {
    const mp4Files = files.filter((f) => f.type.startsWith("video/") || f.name.endsWith(".mp4") || f.name.endsWith(".mov"));
    if (!mp4Files.length) { toast.error("Only video files (MP4, MOV) are accepted"); return; }
    setQueue((q) => [
      ...q,
      ...mp4Files.map((f, i) => ({
        file: f,
        pageNumber: selectedPage + i,
        status: "pending" as const,
      })),
    ]);
  };

  const uploadAll = async () => {
    const pending = queue.filter((q) => q.status === "pending");
    for (const item of pending) {
      setQueue((q) => q.map((x) => x === item ? { ...x, status: "uploading" } : x));
      try {
        const fd = new FormData();
        fd.append("file", item.file);
        fd.append("documentId", String(documentId));
        fd.append("pageNumber", String(item.pageNumber));
        const res = await fetch("/api/upload-video-slide", { method: "POST", body: fd, credentials: "include" });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setQueue((q) => q.map((x) => x === item ? { ...x, status: "done", resultUrl: data.videoUrl } : x));
        refetch();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setQueue((q) => q.map((x) => x === item ? { ...x, status: "error", errorMsg: msg } : x));
      }
    }
  };

  const removeFromQueue = (idx: number) => setQueue((q) => q.filter((_, i) => i !== idx));

  const pageOptions = Array.from({ length: (pages?.length ?? 0) + 1 }, (_, i) => i + 1);

  return (
    <div className="space-y-4">
      {/* Saved video slides */}
      {videoSlides.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Saved Video Slides</p>
          {videoSlides.map((vs) => {
            const page = pages.find((p) => p.pageNumber === vs.pageNumber);
            return (
              <div key={vs.id} className="flex items-center gap-3 border border-border p-2 bg-card">
                <div className="w-16 h-10 bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {vs.thumbnailUrl ? (
                    <img src={vs.thumbnailUrl} alt={`Slide ${vs.pageNumber}`} className="w-full h-full object-cover" />
                  ) : (
                    <Video className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono font-medium">Slide {vs.pageNumber}</p>
                  {vs.durationSeconds && (
                    <p className="text-xs text-muted-foreground">{formatDuration(vs.durationSeconds)}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive shrink-0"
                  onClick={() => deleteVideoSlide.mutate({ id: vs.id, documentId })}
                  disabled={deleteVideoSlide.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload zone */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Add Video Slide</p>
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-xs text-muted-foreground">Insert at slide</span>
            <select
              className="text-xs border border-border bg-background px-1 py-0.5 font-mono"
              value={selectedPage}
              onChange={(e) => setSelectedPage(Number(e.target.value))}
            >
              {pageOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        <div
          className={`border-2 border-dashed transition-colors cursor-pointer p-6 text-center ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(Array.from(e.dataTransfer.files)); }}
          onClick={() => fileInputRef.current?.click()}
        >
          <Video className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Drop MP4 / MOV here or click to browse</p>
          <p className="text-xs text-muted-foreground mt-1">Max 500 MB per file</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,.mp4,.mov"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = ""; }}
          />
        </div>
      </div>

      {/* Upload queue */}
      {queue.length > 0 && (
        <div className="space-y-2">
          {queue.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 border border-border p-2 text-sm">
              <div className="flex-1 min-w-0">
                <p className="truncate font-mono text-xs">{item.file.name}</p>
                <p className="text-xs text-muted-foreground">→ Slide {item.pageNumber}</p>
              </div>
              <div className="shrink-0">
                {item.status === "pending" && <span className="text-xs text-muted-foreground">Pending</span>}
                {item.status === "uploading" && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                {item.status === "done" && <span className="text-xs text-green-600 font-mono">Done</span>}
                {item.status === "error" && <span className="text-xs text-destructive truncate max-w-[120px]">{item.errorMsg}</span>}
              </div>
              {item.status !== "uploading" && (
                <Button variant="ghost" size="icon" className="shrink-0 w-6 h-6" onClick={() => removeFromQueue(idx)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          ))}
          {queue.some((q) => q.status === "pending") && (
            <Button className="w-full" size="sm" onClick={uploadAll}>
              <Upload className="w-4 h-4 mr-2" />
              Upload {queue.filter((q) => q.status === "pending").length} video{queue.filter((q) => q.status === "pending").length > 1 ? "s" : ""}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
