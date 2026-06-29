import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { FileText, Eye, ExternalLink, Plus, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

function StatusBadge({ status }: { status: string }) {
  if (status === "ready") return <span className="tag-brand">READY</span>;
  if (status === "processing") return <span className="ds-tag" style={{ background: "#f5a623" }}>PROCESSING</span>;
  return <span className="ds-tag" style={{ background: "#e74c3c" }}>ERROR</span>;
}

export default function Dashboard() {
  const { data: docs, isLoading, refetch } = trpc.documents.list.useQuery();
  const deleteDoc = trpc.documents.delete.useMutation({
    onSuccess: () => { toast.success("Document deleted"); refetch(); },
    onError: () => toast.error("Failed to delete document"),
  });
  const reprocessDoc = trpc.documents.reprocess.useMutation({
    onSuccess: () => { toast.success("Reprocessing started — check back in a few minutes"); refetch(); },
    onError: () => toast.error("Failed to start reprocessing"),
  });
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const totalViews = docs?.reduce((sum, d) => sum + (d.stats?.totalViews ?? 0), 0) ?? 0;
  const totalDocs = docs?.length ?? 0;

  return (
    <AppLayout title="DOCUMENTS">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-0 mb-6 md:mb-8">
        {[
          { label: "DOCUMENTS", value: totalDocs, icon: FileText },
          { label: "TOTAL VIEWS", value: totalViews, icon: Eye },
          { label: "ACTIVE LINKS", value: docs?.reduce((s, d) => s + d.linkCount, 0) ?? 0, icon: ExternalLink },
        ].map(({ label, value, icon: Icon }, i) => (
          <div
            key={label}
            className="border border-black p-4 md:p-6 bg-white"
            style={{ marginLeft: i > 0 ? "-1px" : 0 }}
          >
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <span className="font-mono text-[10px] md:text-xs uppercase tracking-widest text-gray-500 leading-tight">{label}</span>
              <Icon size={12} className="text-gray-400 shrink-0 ml-1" />
            </div>
            <div className="font-sans text-2xl md:text-4xl font-bold">{value}</div>
          </div>
        ))}
      </div>

      {/* Upload CTA */}
      <div className="mb-4 md:mb-6 flex items-center justify-between">
        <h2 className="font-sans text-xs md:text-sm font-bold uppercase tracking-widest text-gray-500">ALL DOCUMENTS</h2>
        <Link href="/upload">
          <button className="flex items-center gap-2 px-4 md:px-5 py-2 md:py-2.5 bg-[var(--color-brand)] text-black font-sans font-bold text-xs uppercase tracking-widest border border-black ds-shadow-sm ds-hover">
            <Plus size={12} />
            <span className="hidden sm:inline">UPLOAD NEW</span>
            <span className="sm:hidden">NEW</span>
          </button>
        </Link>
      </div>

      {/* Document list */}
      {isLoading ? (
        <div className="border border-black p-12 text-center">
          <div className="font-mono text-xs uppercase tracking-widest text-gray-400 animate-pulse">LOADING...</div>
        </div>
      ) : !docs || docs.length === 0 ? (
        <div className="border border-black p-10 md:p-16 text-center bg-gray-50">
          <div className="w-14 h-14 md:w-16 md:h-16 bg-[var(--color-brand)] border border-black flex items-center justify-center mx-auto mb-5 md:mb-6">
            <FileText size={24} />
          </div>
          <h3 className="font-sans text-lg md:text-xl font-bold uppercase mb-2">NO DOCUMENTS YET</h3>
          <p className="text-sm text-gray-500 mb-6 md:mb-8 font-mono">Upload your first PDF or PPTX to get started.</p>
          <Link href="/upload">
            <button className="px-6 md:px-8 py-3 bg-black text-white font-sans font-bold text-xs uppercase tracking-widest ds-shadow ds-hover">
              UPLOAD DOCUMENT
            </button>
          </Link>
        </div>
      ) : (
        <>
          {/* Desktop table — hidden on mobile */}
          <div className="hidden md:block border border-black">
            <div className="grid grid-cols-12 border-b border-black bg-black text-white px-6 py-3">
              <div className="col-span-5 font-mono text-xs uppercase tracking-widest">DOCUMENT</div>
              <div className="col-span-2 font-mono text-xs uppercase tracking-widest text-center">VIEWS</div>
              <div className="col-span-2 font-mono text-xs uppercase tracking-widest text-center">LINKS</div>
              <div className="col-span-2 font-mono text-xs uppercase tracking-widest text-center">STATUS</div>
              <div className="col-span-1 font-mono text-xs uppercase tracking-widest text-right">ACT.</div>
            </div>
            {docs.map((doc, i) => (
              <div
                key={doc.id}
                className="grid grid-cols-12 items-center px-6 py-4 bg-white hover:bg-gray-50 transition-colors"
                style={{ borderTop: i > 0 ? "1px solid #000" : "none" }}
              >
                <div className="col-span-5">
                  <Link href={`/doc/${doc.id}`}>
                    <div className="font-sans font-semibold text-sm hover:text-[var(--color-brand)] transition-colors truncate cursor-pointer">
                      {doc.title}
                    </div>
                  </Link>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="font-mono text-xs text-gray-400 uppercase">{doc.fileType}</span>
                    <span className="font-mono text-xs text-gray-400">{doc.pageCount} PAGES</span>
                    <span className="font-mono text-xs text-gray-400">
                      {new Date(doc.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                  </div>
                </div>
                <div className="col-span-2 text-center">
                  <span className="font-sans font-bold text-lg">{doc.stats?.totalViews ?? 0}</span>
                </div>
                <div className="col-span-2 text-center">
                  <span className="font-sans font-bold text-lg">{doc.linkCount}</span>
                </div>
                <div className="col-span-2 flex justify-center">
                  <StatusBadge status={doc.status} />
                </div>
                <div className="col-span-1 flex justify-end gap-2">
                  <Link href={`/doc/${doc.id}`}>
                    <button className="p-1.5 border border-black hover:bg-[var(--color-brand)] transition-colors" title="View details">
                      <ExternalLink size={12} />
                    </button>
                  </Link>
                  {doc.status === "error" && (
                    <button
                      className="p-1.5 border border-black hover:bg-[#f5a623] transition-colors"
                      title="Reprocess thumbnails"
                      disabled={reprocessDoc.isPending}
                      onClick={() => reprocessDoc.mutate({ id: doc.id })}
                    >
                      <RefreshCw size={12} />
                    </button>
                  )}
                  <button
                    className="p-1.5 border border-black hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors"
                    title="Delete document"
                    disabled={deletingId === doc.id}
                    onClick={() => {
                      if (confirm(`Delete "${doc.title}"? This cannot be undone.`)) {
                        setDeletingId(doc.id);
                        deleteDoc.mutate({ id: doc.id }, { onSettled: () => setDeletingId(null) });
                      }
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Mobile card list — shown only on mobile */}
          <div className="md:hidden space-y-0 border border-black">
            {docs.map((doc, i) => (
              <div
                key={doc.id}
                className="p-4 bg-white"
                style={{ borderTop: i > 0 ? "1px solid #000" : "none" }}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <Link href={`/doc/${doc.id}`} className="flex-1 min-w-0">
                    <div className="font-sans font-semibold text-sm hover:text-[var(--color-brand)] transition-colors leading-tight">
                      {doc.title}
                    </div>
                  </Link>
                  <StatusBadge status={doc.status} />
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="font-mono text-xs text-gray-400 uppercase">{doc.fileType}</span>
                  <span className="font-mono text-xs text-gray-400">{doc.pageCount} PGS</span>
                  <span className="font-mono text-xs text-gray-400">
                    {new Date(doc.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <Eye size={11} className="text-gray-400" />
                      <span className="font-sans font-bold text-sm">{doc.stats?.totalViews ?? 0}</span>
                      <span className="font-mono text-[10px] text-gray-400 uppercase">views</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ExternalLink size={11} className="text-gray-400" />
                      <span className="font-sans font-bold text-sm">{doc.linkCount}</span>
                      <span className="font-mono text-[10px] text-gray-400 uppercase">links</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/doc/${doc.id}`}>
                      <button className="p-2 border border-black hover:bg-[var(--color-brand)] transition-colors" title="View details">
                        <ExternalLink size={13} />
                      </button>
                    </Link>
                    {doc.status === "error" && (
                      <button
                        className="p-2 border border-black hover:bg-[#f5a623] transition-colors"
                        title="Reprocess thumbnails"
                        disabled={reprocessDoc.isPending}
                        onClick={() => reprocessDoc.mutate({ id: doc.id })}
                      >
                        <RefreshCw size={13} />
                      </button>
                    )}
                    <button
                      className="p-2 border border-black hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors"
                      title="Delete document"
                      disabled={deletingId === doc.id}
                      onClick={() => {
                        if (confirm(`Delete "${doc.title}"? This cannot be undone.`)) {
                          setDeletingId(doc.id);
                          deleteDoc.mutate({ id: doc.id }, { onSettled: () => setDeletingId(null) });
                        }
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </AppLayout>
  );
}
