"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Deterrents against copying, printing and screenshotting the question bank, applied to students only (DashboardShell
 * decides who gets it; this component just protects whatever it wraps). A web page cannot stop an OS screenshot or a
 * phone camera, so the main protection is the watermark: every capture carries the student's identity and the date.
 * The rest raises the effort of casual copying:
 *  - text selection, copy/cut, the context menu and dragging are off inside the wrapped content (form fields still work);
 *  - printing shows a notice instead of the page, and Ctrl/Cmd+P (and Ctrl/Cmd+S) are swallowed;
 *  - PrintScreen blanks the clipboard where the browser allows it, and the screen is briefly shielded;
 *  - holding Cmd+Shift (macOS screenshot shortcuts) or Win+Shift (Windows Snip) shields the screen;
 *  - the screen is shielded while the window is not focused or the tab is hidden (snipping tools, app switchers).
 * The shield is a pointer-transparent overlay drawn over the page, so timers, inputs and pending submissions carry on
 * underneath it untouched. It is toggled by a class on <html> straight from the event handler (not React state) so it
 * paints as early as possible.
 */

const SHIELD_CLASS = "cp-shielded";
const NOTICE_KEY = "nrg-content-protection-notice-v1";

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] as string);

/**
 * Watermark tile as an SVG data URI: horizontal text in brick-staggered rows (one copy centred on the upper row, one
 * split across the edges of the lower row, completed by the neighbouring tile). The tilt comes from rotating the
 * whole tiled layer in CSS, so copies never collide.
 */
function watermarkUri(label: string, color: string) {
  const text = escapeXml(label);
  const w = Math.max(360, Math.ceil(label.length * 8.8) + 110);
  const h = 150;
  const at = (x: number, y: number) => `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${text}</text>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<g fill="${color}" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="600">` +
    at(w / 2, h / 4) + at(0, (3 * h) / 4) + at(w, (3 * h) / 4) +
    `</g></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

const isEditable = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");

export function ContentProtection({
  identity,
  date,
  children,
}: {
  /** Who the watermark names, e.g. "Jane Doe · jane@x.com · 1a2b3c4d". */
  identity: string;
  /** Date stamp for the watermark, computed on the server so it renders identically on both sides. */
  date: string;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showNotice, setShowNotice] = useState(false);

  const label = `${identity} · ${date}`;
  const light = useMemo(() => watermarkUri(label, "#1f1530"), [label]);
  const dark = useMemo(() => watermarkUri(label, "#ffffff"), [label]);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(NOTICE_KEY)) setShowNotice(true);
    } catch {
      /* storage blocked: skip the one-time notice */
    }
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const reasons = new Set<string>();
    const shield = (why: string) => {
      reasons.add(why);
      html.classList.add(SHIELD_CLASS);
    };
    const unshield = (why: string) => {
      reasons.delete(why);
      if (reasons.size === 0) html.classList.remove(SHIELD_CLASS);
    };

    let toastTimer: ReturnType<typeof setTimeout> | undefined;
    const say = (msg: string) => {
      setToast(msg);
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => setToast(null), 2600);
    };

    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const shieldFor = (why: string, ms: number) => {
      shield(why);
      clearTimeout(timers.get(why));
      timers.set(why, setTimeout(() => unshield(why), ms));
    };
    const clearTimed = (why: string) => {
      clearTimeout(timers.get(why));
      timers.delete(why);
      unshield(why);
    };

    const inRoot = (t: EventTarget | null) => t instanceof Node && !!rootRef.current?.contains(t);

    const blankClipboard = () => {
      try {
        void navigator.clipboard?.writeText("").catch(() => {});
      } catch {
        /* not permitted */
      }
    };

    // Copy / cut / context menu / drag inside the protected content (form fields excepted).
    const onCopy = (e: ClipboardEvent) => {
      if (!inRoot(e.target) || isEditable(e.target)) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", "");
      say("Copying questions is disabled.");
    };
    const onContextMenu = (e: MouseEvent) => {
      if (!inRoot(e.target) || isEditable(e.target)) return;
      e.preventDefault();
    };
    const onDragStart = (e: DragEvent) => {
      if (!inRoot(e.target) || isEditable(e.target)) return;
      e.preventDefault();
    };

    // Keyboard: print/save shortcuts, PrintScreen, and the Cmd+Shift / Win+Shift screenshot prefixes.
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && !e.altKey && (k === "p" || k === "s") && !e.shiftKey) {
        e.preventDefault();
        say(k === "p" ? "Printing is disabled for question content." : "Saving this page is disabled.");
        return;
      }
      if (e.key === "PrintScreen") {
        shieldFor("printscreen", 1500);
        return;
      }
      if (e.metaKey && e.shiftKey) {
        // Cmd+Shift+3/4/5 on macOS, Win+Shift+S on Windows: the OS usually takes the final key, but the browser sees
        // the modifiers first, so the screen is shielded while they are held and for a moment after.
        shield("modifiers");
        clearTimeout(timers.get("modifiers"));
        timers.delete("modifiers");
        if (["3", "4", "5", "s", "#", "$", "%"].includes(k)) say("Screenshots of question content are not permitted.");
        return;
      }
      // Any other ordinary keystroke means normal use has resumed.
      if (!e.metaKey && !e.shiftKey && reasons.has("modifiers")) clearTimed("modifiers");
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") {
        blankClipboard();
        shieldFor("printscreen", 1500);
        say("Screenshots of question content are not permitted.");
        return;
      }
      if (reasons.has("modifiers") && (!e.metaKey || !e.shiftKey)) shieldFor("modifiers", 2500);
    };
    const onPointerDown = () => {
      unshield("blur"); // a press inside the page means the window has focus, even if a focus event was missed
      if (reasons.has("modifiers") && !timers.has("modifiers")) return; // keys still held
      clearTimed("modifiers");
    };

    // Focus and visibility. Window blur fires when another app (or a snipping overlay) takes focus; it does not fire
    // for clicks inside the page, native <select> menus or scrolling.
    const onBlur = () => shield("blur");
    const onFocus = () => unshield("blur");
    const onVisibility = () => (document.visibilityState === "hidden" ? shield("hidden") : unshield("hidden"));

    const onBeforePrint = () => say("Printing is disabled for question content.");

    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("dragstart", onDragStart);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeprint", onBeforePrint);
    if (document.visibilityState === "hidden") shield("hidden");

    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("dragstart", onDragStart);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeprint", onBeforePrint);
      timers.forEach((t) => clearTimeout(t));
      clearTimeout(toastTimer);
      html.classList.remove(SHIELD_CLASS);
    };
  }, []);

  const dismissNotice = () => {
    setShowNotice(false);
    try {
      window.localStorage.setItem(NOTICE_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      {/* Raw CSS via innerHTML: React escapes quotes in <style> text on the server, which the browser keeps literally
          inside a raw-text element and then reports as a hydration mismatch. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .cp-root { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
        .cp-root input, .cp-root textarea, .cp-root select, .cp-root [contenteditable="true"] {
          -webkit-user-select: text; user-select: text; -webkit-touch-callout: default;
        }
        .cp-root img { -webkit-user-drag: none; }
        .cp-watermark { position: fixed; inset: 0; z-index: 35; pointer-events: none; overflow: hidden; opacity: 0.08; }
        .cp-watermark::before { content: ""; position: absolute; left: 50%; top: 50%; width: 250vmax; height: 250vmax;
          transform: translate(-50%, -50%) rotate(-28deg); background-image: ${light}; background-repeat: repeat; }
        @media (prefers-color-scheme: dark) {
          .cp-watermark { opacity: 0.1; }
          .cp-watermark::before { background-image: ${dark}; }
        }
        .cp-shield { position: fixed; inset: 0; z-index: 60; pointer-events: none; display: flex; align-items: center;
          justify-content: center; opacity: 0; visibility: hidden; background: rgba(245, 243, 250, 0.9);
          -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px); }
        html.${SHIELD_CLASS} .cp-shield { opacity: 1; visibility: visible; }
        @media (prefers-color-scheme: dark) { .cp-shield { background: rgba(20, 14, 32, 0.9); } }
        .cp-print-notice { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          .cp-watermark, .cp-shield { display: none !important; }
          .cp-print-notice, .cp-print-notice * { visibility: visible !important; }
          .cp-print-notice { display: block !important; position: absolute; top: 0; left: 0; right: 0; padding: 48px;
            font: 16px/1.5 Arial, Helvetica, sans-serif; color: #000; text-align: center; }
        }
      `,
        }}
      />
      <div ref={rootRef} className="cp-root" data-content-protected="">
      {showNotice ? (
        // In the page flow, not floating, so it can never sit on top of an answer or a submit button.
        <div
          role="note"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm"
        >
          <p className="min-w-0 flex-1">
            Screenshots and copying of questions are not permitted. Content is watermarked with your account.
          </p>
          <button
            type="button"
            onClick={dismissNotice}
            className="rounded-md bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-800"
          >
            Got it
          </button>
        </div>
      ) : null}
        {children}
      </div>
      <div className="cp-watermark" aria-hidden="true" data-testid="cp-watermark" />
      <div className="cp-shield" aria-hidden="true" data-testid="cp-shield">
        <div className="rounded-xl border border-brand-100 bg-white px-6 py-4 text-center text-sm text-gray-700 shadow-sm">
          Content hidden while this window is not in focus.
          <br />
          Click or tap the page to continue.
        </div>
      </div>
      <div className="cp-print-notice">
        Printing NRG question content is not permitted.
        <br />
        This material is licensed to {identity} and watermarked.
      </div>
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-4 left-1/2 z-[70] -translate-x-1/2 rounded-lg bg-brand-900 px-4 py-2 text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}
