import { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";

interface VideoControlsConfig {
  allowPause: boolean;
  allowSkip: boolean;
  allowScrub: boolean;
}

interface VideoSlidePlayerProps {
  videoUrl: string;
  controls?: VideoControlsConfig | null;
  /** Called when video ends so the viewer can auto-advance */
  onEnded?: () => void;
}

const DEFAULT_CONTROLS: VideoControlsConfig = {
  allowPause: true,
  allowSkip: true,
  allowScrub: true,
};

export default function VideoSlidePlayer({ videoUrl, controls, onEnded }: VideoSlidePlayerProps) {
  const cfg = controls ?? DEFAULT_CONTROLS;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-play when mounted
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.play().then(() => setIsPlaying(true)).catch(() => {});
    return () => { v.pause(); };
  }, [videoUrl]);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    resetHideTimer();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v || !cfg.allowPause) return;
    if (v.paused) { v.play(); setIsPlaying(true); }
    else { v.pause(); setIsPlaying(false); }
    resetHideTimer();
  };

  const skip = (delta: number) => {
    const v = videoRef.current;
    if (!v || !cfg.allowSkip) return;
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + delta));
    resetHideTimer();
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v || !cfg.allowScrub) return;
    v.currentTime = Number(e.target.value);
    setCurrentTime(Number(e.target.value));
    resetHideTimer();
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const hasAnyControl = cfg.allowPause || cfg.allowSkip || cfg.allowScrub;

  return (
    <div
      className="relative w-full h-full bg-black flex items-center justify-center select-none"
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
      onClick={cfg.allowPause ? togglePlay : undefined}
      style={{ cursor: cfg.allowPause ? "pointer" : "default" }}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full h-full object-contain"
        playsInline
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
        onDurationChange={() => setDuration(videoRef.current?.duration ?? 0)}
        onEnded={() => { setIsPlaying(false); onEnded?.(); }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        // No native controls — we render our own
        controls={false}
      />

      {/* Overlay controls */}
      {hasAnyControl && (
        <div
          className="absolute inset-0 flex flex-col justify-end transition-opacity duration-300"
          style={{ opacity: showControls ? 1 : 0, pointerEvents: showControls ? "auto" : "none" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Gradient scrim */}
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

          {/* Controls bar */}
          <div className="relative z-10 flex flex-col gap-2 px-4 pb-4 pt-2">
            {/* Progress bar */}
            {cfg.allowScrub && duration > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-white/60 text-xs font-mono tabular-nums">{fmt(currentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={currentTime}
                  onChange={seek}
                  className="flex-1 h-1 accent-[var(--color-brand)] cursor-pointer"
                  style={{ accentColor: "var(--color-brand)" }}
                />
                <span className="text-white/60 text-xs font-mono tabular-nums">{fmt(duration)}</span>
              </div>
            )}
            {/* Buttons */}
            {(cfg.allowPause || cfg.allowSkip) && (
              <div className="flex items-center justify-center gap-4">
                {cfg.allowSkip && (
                  <button
                    onClick={() => skip(-10)}
                    className="text-white/80 hover:text-[var(--color-brand)] transition-colors p-1"
                  >
                    <SkipBack size={20} />
                  </button>
                )}
                {cfg.allowPause && (
                  <button
                    onClick={togglePlay}
                    className="w-10 h-10 flex items-center justify-center border border-white/30 text-white hover:border-[var(--color-brand)] hover:text-[var(--color-brand)] transition-colors"
                  >
                    {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                  </button>
                )}
                {cfg.allowSkip && (
                  <button
                    onClick={() => skip(10)}
                    className="text-white/80 hover:text-[var(--color-brand)] transition-colors p-1"
                  >
                    <SkipForward size={20} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Big play icon when paused and no controls shown */}
      {!isPlaying && cfg.allowPause && !showControls && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 flex items-center justify-center bg-black/50 border border-white/20">
            <Play size={28} className="text-white ml-1" />
          </div>
        </div>
      )}
    </div>
  );
}
