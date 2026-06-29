/**
 * NarrationBubble v2.7
 *
 * Desktop layout (pointer events, !isMobile):
 *   ROOT div (position:fixed, pointer-events:none, transparent)
 *     └── GRIP HANDLE strip above circle (cursor:grab, desktop only)
 *           — sole drag target on desktop; pointer capture lives here
 *     └── CIRCLE div (cursor:pointer, onClick=togglePlay, desktop)
 *           └── video, spinner, play/pause/prompt overlay (pointer-events:none)
 *     └── MUTE button (36px circle, bottom-right, appears on hover, desktop only)
 *
 * Mobile layout (!isMobile):
 *   ROOT div (pointer-events:none)
 *     └── CIRCLE div — sole drag + tap target (pointer state machine, touchAction:none)
 *           └── video, spinner, play overlay
 *   (no grip handle, no attached mute button — mute is in the mobile header)
 *
 * Cursor rules (desktop):
 *   - Hovering grip handle → cursor:grab / cursor:grabbing while dragging
 *   - Hovering circle      → cursor:pointer (pointing finger)
 *   - Hovering mute button → cursor:pointer
 */

import {
  useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef,
} from "react";
import { Play, Loader2, GripHorizontal, Volume2, VolumeX } from "lucide-react";

export interface NarrationBubbleHandle {
  isMuted: boolean;
  isHidden: boolean;
  toggleMute: () => void;
  toggleHidden: () => void;
  hasNarrationOnCurrentSlide: boolean;
}

interface NarrationEntry {
  id: number;
  pageNumber: number;
  videoUrl: string;
  cropX?: number;
  cropY?: number;
}

interface Props {
  narrations: NarrationEntry[];
  currentPage: number;
  slideRef: React.RefObject<HTMLImageElement | null>;
  mobileSlideRef?: React.RefObject<HTMLImageElement | null>;
}

const BUBBLE_SIZE    = 200;
const OVERHANG       = 24;
const HANDLE_HEIGHT  = 28;   // desktop grip handle height
const DRAG_THRESHOLD = 6;
const SESSION_PROMPT = "docshare_narration_prompt_dismissed";

const NarrationBubble = forwardRef<NarrationBubbleHandle, Props>(
  function NarrationBubble({ narrations, currentPage, slideRef, mobileSlideRef }, ref) {
    const videoRef  = useRef<HTMLVideoElement>(null);
    const rootRef   = useRef<HTMLDivElement>(null);
    const handleRef = useRef<HTMLDivElement>(null);

    const narration = narrations.find((n) => n.pageNumber === currentPage) ?? null;

    // ── Playback state ──────────────────────────────────────────────────────────
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted,   setIsMuted]   = useState(false);
    const [isHidden,  setIsHidden]  = useState(false);
    const [isLoaded,  setIsLoaded]  = useState(false);
    const [showHover, setShowHover] = useState(false);

    // ── First-slide blinking prompt ─────────────────────────────────────────────
    const firstNarratedPage = narrations.length > 0
      ? Math.min(...narrations.map((n) => n.pageNumber))
      : null;
    const isFirstNarratedSlide = firstNarratedPage !== null && currentPage === firstNarratedPage;
    const [showPrompt, setShowPrompt] = useState(
      () => sessionStorage.getItem(SESSION_PROMPT) !== "1"
    );
    const dismissPrompt = useCallback(() => {
      sessionStorage.setItem(SESSION_PROMPT, "1");
      setShowPrompt(false);
    }, []);

    // ── Expose handle ───────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      isMuted,
      isHidden,
      hasNarrationOnCurrentSlide: !!narration,
      toggleMute: () => {
        const v = videoRef.current;
        if (!v) return;
        v.muted = !v.muted;
        setIsMuted(v.muted);
      },
      toggleHidden: () => setIsHidden((h) => !h),
    }), [isMuted, isHidden, narration]);

    // ── Mobile detection ────────────────────────────────────────────────────────
    const [isMobile, setIsMobile] = useState(
      typeof window !== "undefined" && window.innerWidth <= 768
    );
    useEffect(() => {
      const mq = window.matchMedia("(max-width: 768px)");
      const h = (e: MediaQueryListEvent) => setIsMobile(e.matches);
      mq.addEventListener("change", h);
      return () => mq.removeEventListener("change", h);
    }, []);

    // ── Position ────────────────────────────────────────────────────────────────
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
    const hasBeenDragged = useRef(false);

    const computeDefaultPos = useCallback(() => {
      const img = isMobile
        ? (mobileSlideRef?.current ?? slideRef.current)
        : slideRef.current;
      if (!img) return null;
      const rect = img.getBoundingClientRect();
      // On desktop, top accounts for the grip handle sitting above the circle
      const topOffset = isMobile ? -OVERHANG : -(OVERHANG + HANDLE_HEIGHT);
      return {
        left: rect.right - BUBBLE_SIZE + OVERHANG,
        top:  rect.top + topOffset,
      };
    }, [slideRef, mobileSlideRef, isMobile]);

    useEffect(() => {
      const img = isMobile
        ? (mobileSlideRef?.current ?? slideRef.current)
        : slideRef.current;
      if (!img) return;
      const update = () => {
        if (hasBeenDragged.current) return;
        const p = computeDefaultPos();
        if (p) setPos(p);
      };
      update();
      const ro = new ResizeObserver(update);
      ro.observe(img);
      window.addEventListener("resize", update);
      return () => { ro.disconnect(); window.removeEventListener("resize", update); };
    }, [slideRef, mobileSlideRef, isMobile, computeDefaultPos]);

    // Reset position on slide change
    useEffect(() => {
      hasBeenDragged.current = false;
      const p = computeDefaultPos();
      if (p) setPos(p);
    }, [currentPage, computeDefaultPos]);

    // ── Video src management ────────────────────────────────────────────────────
    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;
      if (!narration) {
        v.pause();
        v.src = "";
        setIsPlaying(false);
        setIsLoaded(false);
        return;
      }
      if (v.src !== narration.videoUrl) {
        v.src = narration.videoUrl;
        v.load();
        setIsLoaded(false);
        setIsPlaying(false);
      }
    }, [narration]);

    const handleCanPlay = useCallback(() => setIsLoaded(true), []);
    const handleEnded   = useCallback(() => setIsPlaying(false), []);

    // ── Play / Pause ────────────────────────────────────────────────────────────
    const togglePlay = useCallback(() => {
      const v = videoRef.current;
      if (!v || !narration || !isLoaded) return;
      dismissPrompt();
      if (v.paused) {
        v.play().then(() => setIsPlaying(true)).catch(() => {});
      } else {
        v.pause();
        setIsPlaying(false);
      }
    }, [narration, isLoaded, dismissPrompt]);

    // ── Mute (desktop attached button) ─────────────────────────────────────────
    const handleMuteClick = useCallback((e: React.MouseEvent) => {
      e.stopPropagation();
      const v = videoRef.current;
      if (!v) return;
      v.muted = !v.muted;
      setIsMuted(v.muted);
    }, []);

    // ── Desktop drag — grip handle only ────────────────────────────────────────
    const desktopDragState = useRef<{
      startX: number; startY: number; startLeft: number; startTop: number;
    } | null>(null);

    const handleDragPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      if (!pos) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      desktopDragState.current = {
        startX: e.clientX, startY: e.clientY,
        startLeft: pos.left, startTop: pos.top,
      };
    }, [pos]);

    const handleDragPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      const ds = desktopDragState.current;
      if (!ds || !handleRef.current?.hasPointerCapture(e.pointerId)) return;
      hasBeenDragged.current = true;
      setPos({
        left: Math.max(0, Math.min(ds.startLeft + e.clientX - ds.startX, window.innerWidth  - BUBBLE_SIZE)),
        top:  Math.max(0, Math.min(ds.startTop  + e.clientY - ds.startY, window.innerHeight - BUBBLE_SIZE - HANDLE_HEIGHT)),
      });
    }, []);

    const handleDragPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      desktopDragState.current = null;
    }, []);

    // ── Mobile drag/tap state machine ───────────────────────────────────────────
    const mobileDragState = useRef<{
      active: boolean;
      startX: number; startY: number;
      startLeft: number; startTop: number;
      isDrag: boolean;
    } | null>(null);

    const handleMobilePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      if (!pos) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      mobileDragState.current = {
        active: true,
        startX: e.clientX, startY: e.clientY,
        startLeft: pos.left, startTop: pos.top,
        isDrag: false,
      };
    }, [pos]);

    const handleMobilePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      const ds = mobileDragState.current;
      if (!ds || !ds.active) return;
      const dx = e.clientX - ds.startX;
      const dy = e.clientY - ds.startY;
      if (!ds.isDrag && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      ds.isDrag = true;
      hasBeenDragged.current = true;
      setPos({
        left: Math.max(0, Math.min(ds.startLeft + dx, window.innerWidth  - BUBBLE_SIZE)),
        top:  Math.max(0, Math.min(ds.startTop  + dy, window.innerHeight - BUBBLE_SIZE)),
      });
    }, []);

    const handleMobilePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      const ds = mobileDragState.current;
      e.currentTarget.releasePointerCapture(e.pointerId);
      if (!ds) return;
      const wasDrag = ds.isDrag;
      mobileDragState.current = null;
      if (!wasDrag) togglePlay();
    }, [togglePlay]);

    // ── Don't render if no narrations ──────────────────────────────────────────
    if (!narrations || narrations.length === 0) return null;

    // Root height: on desktop includes the grip handle above the circle
    const rootHeight = isMobile ? BUBBLE_SIZE : BUBBLE_SIZE + HANDLE_HEIGHT;

    const rootStyle: React.CSSProperties = pos
      ? {
          position:      "fixed",
          left:          pos.left,
          top:           pos.top,
          width:         BUBBLE_SIZE,
          height:        rootHeight,
          zIndex:        50,
          opacity:       (narration && !isHidden) ? 1 : 0,
          transition:    "opacity 0.2s",
          background:    "transparent",
          pointerEvents: "none",
        }
      : {
          position: "fixed", left: -9999, top: -9999,
          width: BUBBLE_SIZE, height: rootHeight,
          zIndex: 50, opacity: 0, background: "transparent",
          pointerEvents: "none",
        };

    // Show play icon:
    // - Desktop: only on hover when paused, or on first-slide prompt
    // - Mobile: always when paused (tap-to-play is the primary CTA)
    const showPlayIcon = isLoaded && !isPlaying && (isMobile || showHover || (isFirstNarratedSlide && showPrompt));
    const showPulse    = isLoaded && !isPlaying && isFirstNarratedSlide && showPrompt;

    return (
      <div ref={rootRef} style={rootStyle} className="select-none">

        {/* ── Desktop: grip handle above circle ── */}
        {!isMobile && (
          <div
            ref={handleRef}
            className="absolute top-0 left-0 w-full flex items-center justify-center gap-1 text-white/40 hover:text-white/80 transition-colors"
            style={{
              height:        HANDLE_HEIGHT,
              cursor:        "grab",
              pointerEvents: "auto",
              userSelect:    "none",
            }}
            onPointerDown={handleDragPointerDown}
            onPointerMove={handleDragPointerMove}
            onPointerUp={handleDragPointerUp}
          >
            <GripHorizontal size={14} />
          </div>
        )}

        {/* ── Circle ── */}
        <div
          className="absolute left-0 rounded-full overflow-hidden border-[3px] border-[var(--color-brand)]"
          style={{
            top:           isMobile ? 0 : HANDLE_HEIGHT,
            width:         BUBBLE_SIZE,
            height:        BUBBLE_SIZE,
            boxShadow:     "0 0 0 4px rgba(0,255,157,0.18), 0 8px 40px rgba(0,0,0,0.75)",
            // Desktop: pointer finger for play/pause; Mobile: handled by pointer state machine
            cursor:        isMobile ? "default" : (narration && isLoaded ? "pointer" : "default"),
            pointerEvents: "auto",
            touchAction:   isMobile ? "none" : undefined,
            userSelect:    "none",
          }}
          // Desktop: simple click
          onClick={!isMobile ? togglePlay : undefined}
          onMouseEnter={!isMobile ? () => setShowHover(true)  : undefined}
          onMouseLeave={!isMobile ? () => setShowHover(false) : undefined}
          // Mobile: pointer state machine for drag + tap
          onPointerDown={isMobile ? handleMobilePointerDown : undefined}
          onPointerMove={isMobile ? handleMobilePointerMove : undefined}
          onPointerUp={isMobile   ? handleMobilePointerUp   : undefined}
        >
          {/* Video */}
          <video
            ref={videoRef}
            className="w-full h-full object-cover pointer-events-none"
            style={{ objectPosition: `${narration?.cropX ?? 50}% ${narration?.cropY ?? 50}%` }}
            playsInline
            muted={isMuted}
            onCanPlay={handleCanPlay}
            onEnded={handleEnded}
            preload="none"
          />

          {/* Loading spinner */}
          {narration && !isLoaded && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center pointer-events-none">
              <Loader2 size={32} className="text-[var(--color-brand)] animate-spin" />
            </div>
          )}

          {/* Play overlay */}
          {showPlayIcon && (
            <div
              className={`absolute inset-0 bg-black/30 flex flex-col items-center justify-center pointer-events-none ${showPulse ? "animate-pulse" : ""}`}
            >
              <Play size={isMobile ? 44 : 36} className="text-[var(--color-brand)] drop-shadow-lg" />
              {showPulse && (
                <span
                  className="text-[var(--color-brand)] text-[10px] font-bold tracking-widest uppercase mt-1"
                  style={{ fontFamily: "monospace", textShadow: "0 0 8px rgba(0,255,157,0.8)" }}
                >
                  PRESS PLAY
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Desktop only: attached mute button (bottom-right, appears on hover) ── */}
        {!isMobile && narration && isLoaded && (
          <button
            onClick={handleMuteClick}
            className="absolute rounded-full bg-black border-2 border-[var(--color-brand)] flex items-center justify-center"
            style={{
              width:         36,
              height:        36,
              bottom:        0,
              right:         -4,
              cursor:        "pointer",
              pointerEvents: "auto",
              boxShadow:     "0 2px 10px rgba(0,0,0,0.7)",
              zIndex:        10,
            }}
          >
            {isMuted
              ? <VolumeX size={14} className="text-[var(--color-brand)]" />
              : <Volume2 size={14} className="text-[var(--color-brand)]" />
            }
          </button>
        )}

      </div>
    );
  }
);

export default NarrationBubble;
