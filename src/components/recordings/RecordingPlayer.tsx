"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { saveRecordingProgress } from "@/lib/recordings/actions";

type Chapter = { start: number; title: string };
type Line = { t: number; text: string };

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const clock = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};
const vtt = (lines: Line[], duration: number) => {
  const ts = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}.000`;
  return "WEBVTT\n\n" + lines.map((l, i) => `${ts(l.t)} --> ${ts(Math.max(l.t + 1, lines[i + 1]?.t ?? duration))}\n${l.text}`).join("\n\n");
};

/**
 * The watch page's player (reference-site style): chapters beside the video, J/K/L shortcuts, speed, resume, captions
 * from the transcript, Notes / Outline / Transcript tabs. A faint moving watermark with the viewer's name and email
 * sits over the video (also in full screen, which is on the wrapper, not the video), downloads are switched off, and
 * progress is saved as the student watches.
 */
export function RecordingPlayer({
  recordingId, src, durationSeconds, resumeAt, chapters, transcript, notes, watermark, saveProgress,
}: {
  recordingId: string; src: string; durationSeconds: number; resumeAt: number; chapters: Chapter[]; transcript: Line[];
  notes: string | null; watermark: string | null; saveProgress: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [tab, setTab] = useState<"notes" | "outline" | "transcript">(notes ? "notes" : "transcript");
  const [find, setFind] = useState("");
  const [spot, setSpot] = useState(0);
  const lastSaved = useRef(0);

  const captions = useMemo(() => (transcript.length ? URL.createObjectURL(new Blob([vtt(transcript, durationSeconds)], { type: "text/vtt" })) : null), [transcript, durationSeconds]);
  useEffect(() => () => { if (captions) URL.revokeObjectURL(captions); }, [captions]);

  const save = useCallback((force = false) => {
    const v = video.current;
    if (!saveProgress || !v) return;
    const now = Date.now();
    if (!force && now - lastSaved.current < 15_000) return;
    lastSaved.current = now;
    void saveRecordingProgress(recordingId, v.ended ? durationSeconds : v.currentTime);
  }, [recordingId, durationSeconds, saveProgress]);

  const seek = (t: number, play = true) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = t;
    if (play) void v.play();
  };
  const setRate = (r: number) => { setSpeed(r); if (video.current) video.current.playbackRate = r; };

  // J / K / L like the reference player (slower, play-pause, faster), Space too; ignore while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      const v = video.current;
      if (!v) return;
      const k = e.key.toLowerCase();
      if (k === "k" || (k === " " && t?.tagName !== "BUTTON")) { e.preventDefault(); if (v.paused) void v.play(); else v.pause(); }
      else if (k === "j") { e.preventDefault(); setRate(SPEEDS[Math.max(0, SPEEDS.indexOf(v.playbackRate) - 1)] ?? 1); }
      else if (k === "l") { e.preventDefault(); setRate(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(v.playbackRate) + 1)] ?? 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Move the watermark every 20 s so it can't be cropped out of a recording.
  useEffect(() => {
    if (!watermark) return;
    const id = window.setInterval(() => setSpot((s) => (s + 1) % 4), 20_000);
    return () => window.clearInterval(id);
  }, [watermark]);

  useEffect(() => {
    const flush = () => { if (document.visibilityState === "hidden") save(true); };
    document.addEventListener("visibilitychange", flush);
    return () => { document.removeEventListener("visibilitychange", flush); save(true); };
  }, [save]);

  const current = chapters.reduce((best, c, i) => (c.start <= time ? i : best), -1);
  const line = transcript.reduce((best, l, i) => (l.t <= time ? i : best), -1);
  const spots = ["left-[6%] top-[8%]", "right-[6%] top-[30%]", "left-[30%] bottom-[22%]", "right-[10%] bottom-[10%]"];
  const lines = find.trim() ? transcript.filter((l) => l.text.toLowerCase().includes(find.trim().toLowerCase())) : transcript;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0">
          <div ref={frame} className="relative w-full max-w-full overflow-hidden rounded-xl bg-black">
            <video
              ref={video}
              src={src}
              controls
              playsInline
              preload="metadata"
              controlsList="nodownload nofullscreen noremoteplayback"
              disablePictureInPicture
              onContextMenu={(e) => e.preventDefault()}
              onLoadedMetadata={(e) => { if (resumeAt > 5 && resumeAt < durationSeconds - 10) e.currentTarget.currentTime = resumeAt; }}
              onTimeUpdate={(e) => { setTime(e.currentTarget.currentTime); save(); }}
              onPause={() => save(true)}
              onEnded={() => save(true)}
              className="aspect-video w-full"
            >
              {captions ? <track kind="captions" srcLang="en" label="English" src={captions} /> : null}
            </video>
            {watermark ? (
              <span aria-hidden className={cn("pointer-events-none absolute select-none text-xs font-semibold text-white/25 transition-all duration-1000 [text-shadow:0_0_2px_rgba(0,0,0,.4)] sm:text-sm", spots[spot])}>
                {watermark}
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Speed</span>
            {SPEEDS.map((r) => (
              <button key={r} type="button" onClick={() => setRate(r)} aria-pressed={speed === r}
                className={cn("rounded-md border px-2 py-1 font-medium tabular-nums", speed === r ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-card-foreground hover:bg-muted")}>
                {r}×
              </button>
            ))}
            <button type="button" onClick={() => frame.current?.requestFullscreen?.().catch(() => undefined)} className="rounded-md border border-border bg-card px-2 py-1 font-medium text-card-foreground hover:bg-muted">Full screen</button>
            <span className="ml-auto hidden sm:inline">Keys: <kbd className="rounded border border-border bg-muted px-1 font-mono">J</kbd> slower · <kbd className="rounded border border-border bg-muted px-1 font-mono">K</kbd> play/pause · <kbd className="rounded border border-border bg-muted px-1 font-mono">L</kbd> faster</span>
          </div>
        </div>

        <nav aria-label="Chapters" className="rounded-xl border border-border/80 bg-card p-2 shadow-sm lg:max-h-[28rem] lg:overflow-y-auto">
          <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chapters</p>
          <ol>
            {chapters.map((c, i) => (
              <li key={i}>
                <button type="button" onClick={() => seek(c.start)} aria-current={i === current ? "true" : undefined}
                  className={cn("flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted", i === current ? "bg-brand-50 font-semibold text-brand-800" : "text-card-foreground")}>
                  <span className="w-11 shrink-0 font-mono text-xs leading-5 text-muted-foreground">{clock(c.start)}</span>
                  <span className="min-w-0">{c.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      <div className="rounded-xl border border-border/80 bg-card shadow-sm">
        <div role="tablist" aria-label="About this recording" className="flex gap-1 border-b border-border/70 p-1.5">
          {([["notes", "Notes"], ["outline", "Outline"], ["transcript", "Transcript"]] as const).map(([k, l]) => (
            <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", tab === k ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>{l}</button>
          ))}
        </div>
        <div role="tabpanel" className="p-4 text-sm leading-relaxed text-card-foreground">
          {tab === "notes" ? (
            notes ? notes.split(/\n{2,}/).map((p, i) => <p key={i} className="mb-3 max-w-[70ch] whitespace-pre-line">{p}</p>) : <p className="text-muted-foreground">No notes for this recording yet.</p>
          ) : tab === "outline" ? (
            <ol className="space-y-1">
              {chapters.map((c, i) => (
                <li key={i}><button type="button" onClick={() => seek(c.start)} className="text-left hover:text-primary"><span className="mr-2 font-mono text-xs text-muted-foreground">{clock(c.start)}</span>{c.title}</button></li>
              ))}
            </ol>
          ) : (
            <div>
              <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search the transcript"
                className="mb-3 w-full max-w-sm rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-card-foreground placeholder:text-muted-foreground" />
              {transcript.length === 0 ? <p className="text-muted-foreground">No transcript for this recording yet.</p> : (
                <ol className="max-h-80 space-y-0.5 overflow-y-auto">
                  {lines.map((l) => {
                    const i = transcript.indexOf(l);
                    return (
                      <li key={i}>
                        <button type="button" onClick={() => seek(l.t)} className={cn("flex w-full gap-3 rounded-md px-2 py-1 text-left hover:bg-muted", i === line && "bg-brand-50")}>
                          <span className="w-11 shrink-0 font-mono text-xs leading-5 text-muted-foreground">{clock(l.t)}</span>
                          <span className="min-w-0">{l.text}</span>
                        </button>
                      </li>
                    );
                  })}
                  {lines.length === 0 ? <li className="text-muted-foreground">Nothing matches “{find}”.</li> : null}
                </ol>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
