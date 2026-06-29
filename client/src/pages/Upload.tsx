import AppLayout from "@/components/AppLayout";
import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Upload as UploadIcon, FileText, CheckCircle, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";

type UploadState = "idle" | "uploading" | "processing" | "done" | "error";

export default function Upload() {
  const [, navigate] = useLocation();
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [docId, setDocId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptedTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-powerpoint",
  ];

  const handleFile = (f: File) => {
    if (!acceptedTypes.includes(f.type) && !f.name.match(/\.(pdf|pptx|ppt)$/i)) {
      toast.error("Only PDF and PPTX files are supported.");
      return;
    }
    if (f.size > 100 * 1024 * 1024) {
      toast.error("File size must be under 100MB.");
      return;
    }
    setFile(f);
    setTitle(f.name.replace(/\.[^.]+$/, ""));
    setState("idle");
    setErrorMsg("");
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  }, []);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const handleUpload = async () => {
    if (!file) return;
    setState("uploading");
    setProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title || file.name.replace(/\.[^.]+$/, ""));

    try {
      // Simulate progress during upload
      const progressInterval = setInterval(() => {
        setProgress((p) => Math.min(p + 5, 85));
      }, 200);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      clearInterval(progressInterval);
      setProgress(90);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }

      const data = await res.json();
      setDocId(data.documentId);
      setProgress(100);
      setState("processing");

      // Poll for document status using tRPC v11 batch format
      const pollStatus = async () => {
        const batchInput = encodeURIComponent(JSON.stringify({ "0": { json: { id: data.documentId } } }));
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          try {
            const statusRes = await fetch(`/api/trpc/documents.get?batch=1&input=${batchInput}`, {
              credentials: "include",
            });
            if (statusRes.ok) {
              const json = await statusRes.json();
              // tRPC batch response: array of results
              const docStatus = Array.isArray(json)
                ? json[0]?.result?.data?.json?.status
                : json?.result?.data?.status;
              if (docStatus === "ready") {
                setState("done");
                return;
              }
              if (docStatus === "error") {
                setState("error");
                setErrorMsg("Thumbnail generation failed. The document was uploaded but pages could not be processed.");
                return;
              }
            }
          } catch {}
        }
        // Timeout — still navigate to doc
        setState("done");
      };

      pollStatus();
    } catch (err: any) {
      setState("error");
      setErrorMsg(err.message || "Upload failed. Please try again.");
      setProgress(0);
    }
  };

  const reset = () => {
    setFile(null);
    setTitle("");
    setState("idle");
    setProgress(0);
    setErrorMsg("");
    setDocId(null);
  };

  return (
    <AppLayout title="UPLOAD DOCUMENT">
      <div className="max-w-2xl w-full">
        {/* Step indicator */}
        <div className="flex items-center gap-0 mb-6 sm:mb-10 overflow-x-auto">
          {["SELECT FILE", "CONFIGURE", "UPLOAD"].map((step, i) => (
            <div key={step} className="flex items-center">
              <div
                className={`px-3 sm:px-4 py-2 border border-black font-mono text-[10px] sm:text-xs uppercase tracking-widest whitespace-nowrap ${
                  i === 0 && !file ? "bg-[var(--color-brand)] text-black" :
                  i === 1 && file && state === "idle" ? "bg-[var(--color-brand)] text-black" :
                  i === 2 && state !== "idle" ? "bg-[var(--color-brand)] text-black" :
                  "bg-white text-gray-400"
                }`}
                style={{ marginLeft: i > 0 ? "-1px" : 0 }}
              >
                {i + 1}. {step}
              </div>
            </div>
          ))}
        </div>

        {/* Done state */}
        {state === "done" && docId && (
          <div className="border border-black p-6 sm:p-10 text-center ds-shadow">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-[var(--color-brand)] border border-black flex items-center justify-center mx-auto mb-4 sm:mb-6">
              <CheckCircle size={28} />
            </div>
            <h2 className="font-sans text-xl sm:text-2xl font-bold uppercase mb-2">UPLOAD COMPLETE</h2>
            <p className="text-sm text-gray-500 mb-6 sm:mb-8 font-mono">
              Your document has been processed and is ready to share.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => navigate(`/doc/${docId}`)}
                className="px-6 sm:px-8 py-3 bg-[var(--color-brand)] text-black font-sans font-bold text-xs uppercase tracking-widest border border-black ds-shadow ds-hover"
              >
                VIEW DOCUMENT
              </button>
              <button
                onClick={reset}
                className="px-6 sm:px-8 py-3 bg-white text-black font-sans font-bold text-xs uppercase tracking-widest border border-black ds-shadow-sm ds-hover"
              >
                UPLOAD ANOTHER
              </button>
            </div>
          </div>
        )}

        {/* Processing state */}
        {state === "processing" && (
          <div className="border border-black p-6 sm:p-10 text-center ds-shadow">
            <div className="w-16 h-16 bg-black border border-black flex items-center justify-center mx-auto mb-6 animate-pulse">
              <FileText size={28} className="text-[var(--color-brand)]" />
            </div>
            <h2 className="font-sans text-2xl font-bold uppercase mb-2">PROCESSING PAGES</h2>
            <p className="text-sm text-gray-500 mb-6 font-mono">
              Generating thumbnails for each page. This may take a moment.
            </p>
            <div className="w-full border border-black h-2 bg-gray-100">
              <div className="h-full bg-[var(--color-brand)] transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-3 font-mono text-xs text-gray-400 uppercase tracking-widest">
              {progress}% COMPLETE
            </div>
          </div>
        )}

        {/* Uploading state */}
        {state === "uploading" && (
          <div className="border border-black p-6 sm:p-10 text-center ds-shadow">
            <div className="w-16 h-16 bg-black border border-black flex items-center justify-center mx-auto mb-6">
              <UploadIcon size={28} className="text-[var(--color-brand)] animate-bounce" />
            </div>
            <h2 className="font-sans text-2xl font-bold uppercase mb-2">UPLOADING</h2>
            <p className="text-sm text-gray-500 mb-6 font-mono">{file?.name}</p>
            <div className="w-full border border-black h-2 bg-gray-100">
              <div className="h-full bg-[var(--color-brand)] transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-3 font-mono text-xs text-gray-400 uppercase tracking-widest">
              {progress}% UPLOADED
            </div>
          </div>
        )}

        {/* Error state */}
        {state === "error" && (
          <div className="border border-red-500 p-8 mb-6" style={{ boxShadow: "4px 4px 0 #ef4444" }}>
            <div className="flex items-start gap-4">
              <AlertCircle size={20} className="text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-sans font-bold uppercase text-sm mb-1">UPLOAD FAILED</h3>
                <p className="text-sm text-gray-600">{errorMsg}</p>
              </div>
            </div>
            <button onClick={reset} className="mt-4 font-mono text-xs uppercase tracking-widest text-gray-500 hover:text-black underline">
              TRY AGAIN
            </button>
          </div>
        )}

        {/* Idle / file selection */}
        {(state === "idle") && (
          <>
            {/* Drop zone */}
            {!file ? (
              <div
                className={`border-2 border-dashed border-black p-8 sm:p-16 text-center cursor-pointer transition-all ${
                  isDragging ? "bg-[var(--color-brand)]/20 border-[var(--color-brand)]" : "bg-gray-50 hover:bg-gray-100"
                }`}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.pptx,.ppt"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
                <div className="w-16 h-16 bg-black border border-black flex items-center justify-center mx-auto mb-6">
                  <UploadIcon size={28} className="text-[var(--color-brand)]" />
                </div>
                <h3 className="font-sans text-xl font-bold uppercase mb-2">DROP FILE HERE</h3>
                <p className="text-sm text-gray-500 font-mono mb-4">OR CLICK TO BROWSE</p>
                <div className="flex items-center justify-center gap-3">
                  <span className="ds-tag">PDF</span>
                  <span className="ds-tag">PPTX</span>
                  <span className="font-mono text-xs text-gray-400">MAX 100MB</span>
                </div>
              </div>
            ) : (
              /* File selected — configure */
              <div className="border border-black p-5 sm:p-8 ds-shadow">
                {/* File info */}
                <div className="flex items-center gap-4 p-4 bg-gray-50 border border-black mb-6">
                  <div className="w-10 h-10 bg-[var(--color-brand)] border border-black flex items-center justify-center flex-shrink-0">
                    <FileText size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-sans font-semibold text-sm truncate">{file.name}</div>
                    <div className="font-mono text-xs text-gray-400 uppercase mt-0.5">
                      {file.name.match(/\.pptx?$/i) ? "PPTX" : "PDF"} · {(file.size / 1024 / 1024).toFixed(1)} MB
                    </div>
                  </div>
                  <button onClick={reset} className="p-1.5 hover:bg-red-100 transition-colors">
                    <X size={14} />
                  </button>
                </div>

                {/* PPTX fidelity warning */}
                {file.name.match(/\.pptx?$/i) && (
                  <div className="flex items-start gap-3 p-4 border border-amber-400 bg-amber-50 mb-6">
                    <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="font-mono text-xs text-amber-800 leading-relaxed">
                      POWERPOINT FILES ARE CONVERTED TO IMAGES. CUSTOM FONTS, ANIMATIONS, AND EMBEDDED MEDIA MAY NOT RENDER EXACTLY AS IN POWERPOINT. FOR BEST RESULTS, EXPORT AS PDF FIRST.
                    </p>
                  </div>
                )}

                {/* Title input */}
                <div className="mb-6">
                  <label className="block font-mono text-xs uppercase tracking-widest text-gray-500 mb-2">
                    DOCUMENT TITLE
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full border border-black px-4 py-3 font-sans text-sm focus:outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-brand)]/20"
                    placeholder="Enter document title..."
                  />
                </div>

                {/* Upload button */}
                <button
                  onClick={handleUpload}
                  disabled={!title.trim()}
                  className="w-full py-4 bg-[var(--color-brand)] text-black font-sans font-bold text-sm uppercase tracking-widest border border-black ds-shadow ds-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  UPLOAD DOCUMENT
                </button>

                <p className="mt-4 text-xs text-gray-400 font-mono text-center">
                  THUMBNAILS WILL BE GENERATED AUTOMATICALLY FOR EACH PAGE
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
