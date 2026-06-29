import { trpc } from "@/lib/trpc";
import { useParams } from "wouter";
import {
  useState, useEffect, useCallback, useRef,
  useMemo,
} from "react";
import {
  ChevronLeft, ChevronRight, Lock, FileText,
  ZoomIn, ZoomOut, Layers, Volume2, VolumeX, Video, VideoOff,
} from "lucide-react";
import NarrationBubble, { NarrationBubbleHandle } from "@/components/NarrationBubble";
import VideoSlidePlayer from "@/components/VideoSlidePlayer";

const TOPBAR_H  = 52;
const BOTBAR_H  = 52;
const SIDEBAR_W = 120;

export default function Viewer() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";

  const [password, setPassword]               = useState("");
  const [enteredPassword, setEnteredPassword] = useState<string | undefined>(undefined);
  const [currentPage, setCurrentPage]         = useState(1);
  const [sessionId]                           = useState(() => Math.random().toString(36).slice(2));
  const [pageStartTime, setPageStartTime]     = useState<number>(Date.now());
  const [viewId, setViewId]                   = useState<number | null>(null);
  const [zoom, setZoom]                       = useState(1);
  const [showStrip, setShowStrip]             = useState(false);

  const bubbleRef = useRef<NarrationBubbleHandle>(null);
  // Track mute/hidden in Viewer React state so labels update correctly.
  // Reading from bubbleRef.current during render gives the post-toggle value,
  // which makes the label appear inverted. Owned state here is the source of truth.
  const [bubbleIsMuted,  setBubbleIsMuted]  = useState(false);
  const [bubbleIsHidden, setBubbleIsHidden] = useState(false);

  const slideImgRef       = useRef<HTMLImageElement>(null);
  const mobileSlideImgRef = useRef<HTMLImageElement>(null);

  // Mobile pinch-to-zoom + pan
  const [mobileZoom,   setMobileZoom]   = useState(1);
  const [mobilePan,    setMobilePan]    = useState({ x: 0, y: 0 });
  const [mobileOrigin, setMobileOrigin] = useState({ x: 50, y: 50 });

  // Stable refs for imperative touch handlers
  const mobileZoomRef = useRef(mobileZoom);
  const mobilePanRef  = useRef(mobilePan);
  useEffect(() => { mobileZoomRef.current = mobileZoom; }, [mobileZoom]);
  useEffect(() => { mobilePanRef.current  = mobilePan;  }, [mobilePan]);

  const touchState = useRef<{
    mode: "idle" | "swipe" | "pinch" | "pan";
    startX: number; startY: number;
    pinchDist: number; pinchZoom: number;
    panStartX: number; panStartY: number;
    panStartPx: number; panStartPy: number;
  }>({
    mode: "idle",
    startX: 0, startY: 0,
    pinchDist: 0, pinchZoom: 1,
    panStartX: 0, panStartY: 0, panStartPx: 0, panStartPy: 0,
  });

  const { data, isLoading, error } = trpc.shareLinks.view.useQuery(
    { slug, password: enteredPassword },
    { retry: false, enabled: !!slug }
  );

  const documentId       = data?.document?.id ?? null;
  const activeVersionId  = data?.document?.activeVersionId ?? null;
  const { data: narrations } = trpc.narrations.list.useQuery(
    { documentId: documentId!, versionId: activeVersionId },
    { enabled: !!documentId }
  );
  const { data: videoSlides = [] } = trpc.videoSlides.list.useQuery(
    { documentId: documentId!, versionId: activeVersionId },
    { enabled: !!documentId }
  );
  const rawVC = data?.link?.videoControls as { allowPause?: boolean; allowSkip?: boolean; allowScrub?: boolean } | null | undefined;
  const videoControls = rawVC ? { allowPause: rawVC.allowPause ?? true, allowSkip: rawVC.allowSkip ?? true, allowScrub: rawVC.allowScrub ?? true } : null;

  const recordView     = trpc.analytics.recordView.useMutation({
    onSuccess: (result) => { if (result?.viewId) setViewId(result.viewId); },
  });
  const recordPageView = trpc.analytics.recordPageView.useMutation();

  useEffect(() => {
    if (data?.document && !viewId) {
      recordView.mutate({
        shareLinkId: data.link.id,
        documentId:  data.document.id,
        sessionId,
        userAgent:   navigator.userAgent,
        referrer:    document.referrer || undefined,
      });
    }
  }, [data?.document?.id]);

  useEffect(() => {
    if (!data?.document || !viewId) return;
    const now       = Date.now();
    const timeSpent = Math.round((now - pageStartTime) / 1000);
    setPageStartTime(now);
    // Use the original pageNumber from the ordered pages array so analytics track slide identity,
    // not display position. pages[currentPage - 1] is the positional lookup after slideConfig ordering.
    const originalPageNumber = pages[currentPage - 1]?.pageNumber ?? currentPage;
    recordPageView.mutate({ viewId, documentId: data.document.id, pageNumber: originalPageNumber, timeSpentSeconds: timeSpent });
  }, [currentPage, viewId]);

  useEffect(() => {
    const handleUnload = () => {
      if (!viewId || !data?.document) return;
      const timeSpent = Math.round((Date.now() - pageStartTime) / 1000);
      const originalPageNumber = pages[currentPage - 1]?.pageNumber ?? currentPage;
      recordPageView.mutate({ viewId, documentId: data.document.id, pageNumber: originalPageNumber, timeSpentSeconds: timeSpent });
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [viewId, currentPage, pageStartTime, data?.document?.id]);

  const pages           = data?.document?.pages ?? [];
  const totalPages      = pages.length;
  // pages is already in the correct display order (slideConfig applied server-side).
  // Use positional index so reordered slides render correctly.
  const currentPageData = pages[currentPage - 1] ?? null;

  const goTo = useCallback((page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    setMobileZoom(1);
    setMobilePan({ x: 0, y: 0 });
  }, [totalPages]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") goTo(currentPage + 1);
      if (e.key === "ArrowLeft"  || e.key === "ArrowUp")   goTo(currentPage - 1);
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(+(z + 0.25).toFixed(2), 3));
      if (e.key === "-") setZoom((z) => Math.max(+(z - 0.25).toFixed(2), 0.25));
      if (e.key === "0") setZoom(1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentPage, totalPages, goTo]);

  // Clamp pan so slide never fully exits the viewport
  const clampPan = useCallback((px: number, py: number, scale: number) => {
    const vw   = window.innerWidth;
    const vh   = window.innerHeight - TOPBAR_H - BOTBAR_H;
    const maxX = Math.max(0, (scale - 1) * vw / 2);
    const maxY = Math.max(0, (scale - 1) * vh / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, px)),
      y: Math.max(-maxY, Math.min(maxY, py)),
    };
  }, []);

  // Stable refs so touch handlers (registered once) can access latest values
  const goToRef        = useRef(goTo);
  const clampPanRef    = useRef(clampPan);
  const currentPageRef = useRef(currentPage);
  useEffect(() => { goToRef.current       = goTo;        }, [goTo]);
  useEffect(() => { clampPanRef.current   = clampPan;    }, [clampPan]);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  // Use a callback ref so the listeners are attached the moment the div mounts
  // (not in a useEffect with [] which runs before the data-gated JSX is rendered).
  const touchListenersCleanup = useRef<(() => void) | null>(null);

  const slideContainerRef = useCallback((el: HTMLDivElement | null) => {
    // Clean up previous listeners if ref changes
    if (touchListenersCleanup.current) {
      touchListenersCleanup.current();
      touchListenersCleanup.current = null;
    }
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      const ts = touchState.current;
      if (e.touches.length === 1) {
        ts.mode       = "idle";
        ts.startX     = e.touches[0].clientX;
        ts.startY     = e.touches[0].clientY;
        ts.panStartX  = e.touches[0].clientX;
        ts.panStartY  = e.touches[0].clientY;
        ts.panStartPx = mobilePanRef.current.x;
        ts.panStartPy = mobilePanRef.current.y;
      } else if (e.touches.length === 2) {
        ts.mode = "pinch";
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        ts.pinchDist = Math.hypot(dx, dy);
        ts.pinchZoom = mobileZoomRef.current;
        const img = mobileSlideImgRef.current;
        if (img) {
          const rect = img.getBoundingClientRect();
          const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          setMobileOrigin({
            x: Math.max(0, Math.min(100, ((mx - rect.left) / rect.width)  * 100)),
            y: Math.max(0, Math.min(100, ((my - rect.top)  / rect.height) * 100)),
          });
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const ts = touchState.current;

      if (e.touches.length === 2 && ts.mode === "pinch") {
        e.preventDefault();
        const dx   = e.touches[1].clientX - e.touches[0].clientX;
        const dy   = e.touches[1].clientY - e.touches[0].clientY;
        const dist = Math.hypot(dx, dy);
        const newZoom = Math.max(1, Math.min(4, ts.pinchZoom * (dist / ts.pinchDist)));
        setMobileZoom(newZoom);
        if (newZoom <= 1) setMobilePan({ x: 0, y: 0 });
        return;
      }

      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - ts.startX;
        const dy = e.touches[0].clientY - ts.startY;

        if (ts.mode === "idle") {
          // If already zoomed in, always pan. Otherwise decide by gesture direction.
          if (mobileZoomRef.current > 1) {
            ts.mode = "pan";
          } else if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
            ts.mode = Math.abs(dx) >= Math.abs(dy) ? "swipe" : "pan";
          }
        }

        if (ts.mode === "pan") {
          e.preventDefault();
          const newPan = clampPanRef.current(
            ts.panStartPx + (e.touches[0].clientX - ts.panStartX),
            ts.panStartPy + (e.touches[0].clientY - ts.panStartY),
            mobileZoomRef.current,
          );
          setMobilePan(newPan);
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const ts = touchState.current;
      if (ts.mode === "swipe" && e.changedTouches.length === 1) {
        const dx = e.changedTouches[0].clientX - ts.startX;
        const dy = e.changedTouches[0].clientY - ts.startY;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
          if (dx < 0) goToRef.current(currentPageRef.current + 1);
          else         goToRef.current(currentPageRef.current - 1);
        }
      }
      if (e.touches.length < 2) ts.mode = "idle";
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove",  onTouchMove,  { passive: false });
    el.addEventListener("touchend",   onTouchEnd,   { passive: true });

    touchListenersCleanup.current = () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove",  onTouchMove);
      el.removeEventListener("touchend",   onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // callback ref — stable, all values accessed via mutable refs

  const currentNarration = useMemo(
    () => narrations?.find((n) => n.pageNumber === currentPage) ?? null,
    [narrations, currentPage]
  );
  // Find video slide for current page (if any)
  const currentVideoSlide = videoSlides.find((vs) => vs.pageNumber === currentPage) ?? null;
  // No narration bubble on video slides
  const hasNarration = !!currentNarration && !currentVideoSlide;

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border border-[var(--color-brand)] flex items-center justify-center mx-auto mb-4 animate-pulse">
            <FileText size={20} className="text-[var(--color-brand)]" />
          </div>
          <div className="text-xs uppercase tracking-widest text-white/40" style={{ fontFamily: "monospace" }}>LOADING...</div>
        </div>
      </div>
    );
  }

  if (!data) {
    const errCode       = (error as any)?.data?.code;
    const needsPassword = errCode === "UNAUTHORIZED" || (!enteredPassword && !isLoading);

    if (needsPassword) {
      return (
        <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
          <div className="border border-white/20 p-8 md:p-10 max-w-sm w-full" style={{ boxShadow: "4px 4px 0 var(--color-brand)" }}>
            <div className="mb-6">
              <span className="text-xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>DocShare</span>
            </div>
            <div className="w-10 h-10 bg-[var(--color-brand)] flex items-center justify-center mb-5">
              <Lock size={18} className="text-black" />
            </div>
            <h2 className="text-xl font-bold uppercase mb-2 text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>PASSWORD REQUIRED</h2>
            <p className="text-sm text-white/40 mb-6" style={{ fontFamily: "monospace" }}>This document is password protected.</p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setEnteredPassword(password)}
              placeholder="Enter password..."
              className="w-full bg-transparent border border-white/20 text-white text-sm px-3 py-3 mb-3 focus:outline-none focus:border-[var(--color-brand)] placeholder:text-white/20"
              style={{ fontFamily: "monospace" }}
              autoFocus
            />
            <button
              onClick={() => setEnteredPassword(password)}
              className="w-full py-3 bg-[var(--color-brand)] text-black font-bold text-sm uppercase tracking-widest border border-[var(--color-brand)]"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              UNLOCK
            </button>
            {enteredPassword && errCode === "UNAUTHORIZED" && (
              <p className="mt-3 text-xs text-red-400 text-center" style={{ fontFamily: "monospace" }}>INCORRECT PASSWORD</p>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center p-4">
        <div className="border border-white/20 p-8 md:p-10 max-w-sm w-full text-center">
          <h2 className="text-xl font-bold uppercase mb-2 text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>LINK UNAVAILABLE</h2>
          <p className="text-sm text-white/40" style={{ fontFamily: "monospace" }}>This link has expired, been disabled, or does not exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden" style={{ fontFamily: "Inter, sans-serif" }}>

      {/* TOP BAR */}
      <div
        className="absolute top-0 left-0 right-0 border-b border-white/10 bg-black flex items-center gap-2 md:gap-3 px-3 md:px-4"
        style={{ height: TOPBAR_H, zIndex: 20 }}
      >
        <div className="flex-shrink-0 hidden sm:block">
          <span className="text-sm font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>DocShare</span>
        </div>

        <div className="sm:border-l sm:border-white/20 sm:pl-3 min-w-0 flex-shrink-0">
          <div className="text-sm font-semibold text-white truncate max-w-[120px] sm:max-w-[200px] md:max-w-sm" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {data.document?.title ?? data.composedDeck?.name ?? "Presentation"}
          </div>
          <div className="text-[10px] text-white/40 uppercase hidden sm:block" style={{ fontFamily: "monospace" }}>
            {data.document ? `${data.document.fileType} · ` : ""}{totalPages} PAGES
          </div>
        </div>

        {hasNarration && (
          <div className="flex items-center gap-1 md:gap-2 ml-1 md:ml-2">
            <button
              onClick={() => { bubbleRef.current?.toggleMute(); setBubbleIsMuted((m) => !m); }}
              className="flex items-center gap-1 px-2 py-1 border border-white/20 text-white/70 hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] transition-colors text-xs uppercase tracking-wide"
              style={{ fontFamily: "monospace" }}
            >
              {bubbleIsMuted
                ? <><VolumeX size={12} /><span className="hidden sm:inline ml-1">UNMUTE</span></>
                : <><Volume2 size={12} /><span className="hidden sm:inline ml-1">MUTE</span></>
              }
            </button>
            <button
              onClick={() => { bubbleRef.current?.toggleHidden(); setBubbleIsHidden((h) => !h); }}
              className="flex items-center gap-1 px-2 py-1 border border-white/20 text-white/70 hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] transition-colors text-xs uppercase tracking-wide whitespace-nowrap"
              style={{ fontFamily: "monospace" }}
            >
              {bubbleIsHidden
                ? <><Video    size={12} /><span className="ml-1">SHOW VIDEO</span></>
                : <><VideoOff size={12} /><span className="ml-1">HIDE VIDEO</span></>
              }
            </button>
          </div>
        )}

        <div className="flex-1" />

        <div className="hidden sm:flex items-center border border-white/20 flex-shrink-0">
          <button onClick={() => setZoom((z) => Math.max(+(z - 0.25).toFixed(2), 0.25))} className="px-2 py-1 text-white/60 hover:text-white hover:bg-white/10 transition-colors">
            <ZoomOut size={13} />
          </button>
          <button onClick={() => setZoom(1)} className="px-2 py-1 text-xs text-white/60 hover:text-[var(--color-brand)] transition-colors min-w-[40px] text-center" style={{ fontFamily: "monospace" }}>
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => setZoom((z) => Math.min(+(z + 0.25).toFixed(2), 3))} className="px-2 py-1 text-white/60 hover:text-white hover:bg-white/10 transition-colors">
            <ZoomIn size={13} />
          </button>
        </div>

        <button
          onClick={() => setShowStrip((s) => !s)}
          className={`md:hidden p-2 border transition-colors flex-shrink-0 ${showStrip ? "border-[var(--color-brand)] text-[var(--color-brand)]" : "border-white/20 text-white/60"}`}
        >
          <Layers size={15} />
        </button>
      </div>

      {/* DESKTOP SIDEBAR */}
      <div
        className="hidden md:block absolute left-0 bottom-0 bg-black border-r border-white/10 overflow-y-auto"
        style={{ top: TOPBAR_H, bottom: BOTBAR_H, width: SIDEBAR_W, zIndex: 10 }}
      >
        {pages.map((page) => (
          <button
            key={page.id}
            onClick={() => goTo(page.pageNumber)}
            className={`w-full p-2 border-b border-white/10 transition-all text-left ${
              page.pageNumber === currentPage ? "bg-[var(--color-brand)]/10 border-l-2 border-l-[var(--color-brand)]" : "hover:bg-white/5"
            }`}
          >
            <img src={page.thumbnailUrl} alt={`Page ${page.pageNumber}`} className="w-full border border-white/10 block" style={{ aspectRatio: "16/9", objectFit: "cover" }} loading="lazy" />
            <div className={`text-xs mt-1 text-center ${page.pageNumber === currentPage ? "text-[var(--color-brand)]" : "text-white/30"}`} style={{ fontFamily: "monospace" }}>
              {page.pageNumber}
            </div>
          </button>
        ))}
      </div>

      {/* MOBILE THUMBNAIL STRIP */}
      {showStrip && (
        <div className="md:hidden absolute left-0 right-0 bg-black border-t border-white/10 overflow-x-auto flex items-center" style={{ bottom: BOTBAR_H, height: 80, zIndex: 15 }}>
          {pages.map((page) => (
            <button
              key={page.id}
              onClick={() => { goTo(page.pageNumber); setShowStrip(false); }}
              className={`flex-shrink-0 h-full flex flex-col items-center justify-center px-2 border-r border-white/10 transition-all ${
                page.pageNumber === currentPage ? "bg-[var(--color-brand)]/10 border-b-2 border-b-[var(--color-brand)]" : "hover:bg-white/5"
              }`}
              style={{ width: 72 }}
            >
              <img src={page.thumbnailUrl} alt={`Page ${page.pageNumber}`} className="border border-white/10 block" style={{ width: 56, height: 32, objectFit: "cover" }} loading="lazy" />
              <div className={`text-[10px] mt-1 ${page.pageNumber === currentPage ? "text-[var(--color-brand)]" : "text-white/30"}`} style={{ fontFamily: "monospace" }}>
                {page.pageNumber}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* SLIDE AREA */}
      <div className="absolute bg-[#0a0a0a]" style={{ top: TOPBAR_H, left: 0, right: 0, bottom: BOTBAR_H, zIndex: 5, overflow: "hidden" }}>

        {/* Desktop */}
        <div className="hidden md:block absolute inset-0 overflow-auto" style={{ left: SIDEBAR_W }}>
          <div style={{ minWidth: "100%", minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px", boxSizing: "border-box" }}>
            {currentPageData ? (
              <div style={{ width: `${zoom * 100}%`, maxWidth: zoom <= 1 ? "960px" : "none", flexShrink: 0, transition: "width 0.15s ease" }}>
                {currentVideoSlide ? (
                  <div style={{ aspectRatio: "16/9", width: "100%" }}>
                    <VideoSlidePlayer
                      videoUrl={currentVideoSlide.videoUrl}
                      controls={videoControls}
                      onEnded={() => goTo(currentPage + 1)}
                    />
                  </div>
                ) : (
                  <img
                    ref={slideImgRef}
                    key={currentPageData.id}
                    src={currentPageData.thumbnailUrl}
                    alt={`Page ${currentPage}`}
                    className="w-full block"
                    style={{ aspectRatio: "16/9", objectFit: "contain", boxShadow: "0 4px 40px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06)" }}
                    draggable={false}
                  />
                )}
              </div>
            ) : (
              <div className="text-xs text-white/30 uppercase" style={{ fontFamily: "monospace" }}>NO PREVIEW AVAILABLE</div>
            )}
          </div>
        </div>

        {/* Mobile — pinch-to-zoom + pan via imperative touch handlers */}
        <div
          ref={slideContainerRef}
          className="md:hidden absolute inset-0 flex items-center justify-center overflow-hidden"
          style={{ padding: "12px", touchAction: "none" }}
        >
          {currentPageData ? (
            currentVideoSlide ? (
              <div className="w-full" style={{ aspectRatio: "16/9" }}>
                <VideoSlidePlayer
                  videoUrl={currentVideoSlide.videoUrl}
                  controls={videoControls}
                  onEnded={() => goTo(currentPage + 1)}
                />
              </div>
            ) : (
            <img
              ref={mobileSlideImgRef}
              key={currentPageData.id}
              src={currentPageData.thumbnailUrl}
              alt={`Page ${currentPage}`}
              className="w-full block"
              style={{
                objectFit: "contain",
                boxShadow: "0 4px 24px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06)",
                transform: `scale(${mobileZoom}) translate(${mobilePan.x / mobileZoom}px, ${mobilePan.y / mobileZoom}px)`,
                transformOrigin: `${mobileOrigin.x}% ${mobileOrigin.y}%`,
                transition: mobileZoom === 1 ? "transform 0.2s ease" : "none",
                willChange: "transform",
                userSelect: "none",
                WebkitUserSelect: "none",
              } as React.CSSProperties}
              draggable={false}
            />
            )
          ) : (
            <div className="text-xs text-white/30 uppercase" style={{ fontFamily: "monospace" }}>NO PREVIEW AVAILABLE</div>
          )}
        </div>
      </div>

      {/* BOTTOM NAV BAR */}
      <div className="absolute left-0 right-0 bottom-0 border-t border-white/10 bg-black flex items-center justify-center gap-3 md:gap-5" style={{ height: BOTBAR_H, zIndex: 20 }}>
        <button onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1} className="p-2 border border-white/20 text-white hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft size={15} />
        </button>

        <div className="flex items-center gap-2">
          <span className="text-sm text-white" style={{ fontFamily: "monospace" }}>{currentPage}</span>
          <span className="text-xs text-white/30" style={{ fontFamily: "monospace" }}>/</span>
          <span className="text-sm text-white/40" style={{ fontFamily: "monospace" }}>{totalPages}</span>
        </div>

        <div className="flex items-center gap-1">
          {pages.slice(0, Math.min(totalPages, 20)).map((_, i) => (
            <button key={i} onClick={() => goTo(i + 1)} className={`h-1.5 transition-all ${i + 1 === currentPage ? "bg-[var(--color-brand)] w-4" : "bg-white/20 hover:bg-white/40 w-1.5"}`} />
          ))}
          {totalPages > 20 && <span className="text-xs text-white/30 ml-1" style={{ fontFamily: "monospace" }}>+{totalPages - 20}</span>}
        </div>

        <button onClick={() => goTo(currentPage + 1)} disabled={currentPage >= totalPages} className="p-2 border border-white/20 text-white hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronRight size={15} />
        </button>
      </div>

      {/* NARRATION BUBBLE — hidden on video slides */}
      {narrations && narrations.length > 0 && !currentVideoSlide && (
        <NarrationBubble
          ref={bubbleRef}
          narrations={narrations}
          currentPage={currentPage}
          slideRef={slideImgRef}
          mobileSlideRef={mobileSlideImgRef}
        />
      )}
    </div>
  );
}
