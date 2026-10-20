"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { THEME_LIST } from "@/lib/theme/themes";

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
 * Watermark tile as an SVG data URI, drawn already tilted so it can be a plain repeating background (behind the content,
 * Ian 2026-10-19) rather than a rotated overlay on top of it. The tile is W×H with the text running along its diagonal
 * direction (W, −H), so that direction is a lattice vector and every line of text continues seamlessly into the
 * neighbouring tiles. Four parallel lines per tile; each copy is also drawn shifted by ±W / ±H so the parts that cross
 * the tile edge are completed by the neighbours. Opacity is baked into the ink (a background image has no opacity).
 */
function watermarkUri(label: string, color: string, opacity: number) {
  const text = escapeXml(label);
  const D = Math.ceil(label.length * 8.8) + 140; // period along a line: the text plus a gap
  const ANGLE = (28 * Math.PI) / 180;
  const W = Math.round(D * Math.cos(ANGLE)), H = Math.round(D * Math.sin(ANGLE));
  const deg = (-Math.atan2(H, W) * 180) / Math.PI;
  const len = Math.hypot(W, H);
  const texts: string[] = [];
  for (let k = 0; k < 4; k++) {
    // Line k crosses the top edge at x = kW/4; slide each line's copy along it so the rows are staggered.
    const f = (k * 0.37) % 1;
    const cx = (k * W) / 4 + f * W, cy = -f * H;
    for (const dx of [-W, 0, W, 2 * W]) {
      for (const dy of [-H, 0, H, 2 * H]) {
        const x = cx + dx, y = cy + dy;
        if (x < -len / 2 || x > W + len / 2 || y < -len / 2 || y > H + len / 2) continue;
        if (Math.max(Math.abs(x - W / 2) - W / 2, 0) ** 2 + Math.max(Math.abs(y - H / 2) - H / 2, 0) ** 2 > (len / 2) ** 2) continue;
        const X = x.toFixed(1), Y = y.toFixed(1);
        texts.push(`<text x="${X}" y="${Y}" transform="rotate(${deg.toFixed(3)} ${X} ${Y})" text-anchor="middle" dominant-baseline="middle">${text}</text>`);
      }
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<g fill="${color}" fill-opacity="${opacity}" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="600">` +
    texts.join("") +
    `</g></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

/** Opaque surfaces the watermark is painted on, besides the page itself. Translucent ones (`bg-muted/40` …) let the
 *  surface underneath show through, so they need nothing. */
const SURFACES = [".bg-card", ".bg-muted", ".bg-brand-50", ".bg-white", ".bg-popover", ".bg-card\\/95"];
const WM_CLASS = "cp-watermarked";

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
  // One tile per theme, in that theme's ink: dark ink on the light themes, white on the dark one, each at its own
  // opacity (themes.ts). It is painted as a background on the page and on every opaque surface, pinned to the window
  // (background-attachment: fixed) so the tiles line up across cards; text and controls sit on top of it.
  const watermarkCss = useMemo(() => {
    const targets = ["body", ...SURFACES].map((sel) => `html.${WM_CLASS} ${sel}`).join(", ");
    return (
      THEME_LIST.map(
        (t) => `html.${WM_CLASS}[data-theme="${t.id}"] { --cp-wm: ${watermarkUri(label, t.watermark.ink, t.watermark.opacity)}; }`
      ).join("\n") +
      `\n${targets} { background-image: var(--cp-wm); background-repeat: repeat; background-attachment: fixed; }`
    );
  }, [label]);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(NOTICE_KEY)) setShowNotice(true);
    } catch {
      /* storage blocked: skip the one-time notice */
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.add(WM_CLASS);
    return () => document.documentElement.classList.remove(WM_CLASS);
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
        ${watermarkCss}
        .cp-shield { position: fixed; inset: 0; z-index: 60; pointer-events: none; display: flex; align-items: center;
          justify-content: center; opacity: 0; visibility: hidden; background: hsl(var(--muted) / 0.9);
          -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px); }
        html.${SHIELD_CLASS} .cp-shield { opacity: 1; visibility: visible; }
        .cp-print-notice { display: none; }
        @media print {
          body * { visibility: hidden !important; }
          .cp-shield { display: none !important; }
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
          className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-card px-4 py-3 text-sm text-card-foreground shadow-sm"
        >
          <p className="min-w-0 flex-1">
            Screenshots and copying of questions are not permitted. Content is watermarked with your account.
          </p>
          <button
            type="button"
            onClick={dismissNotice}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            Got it
          </button>
        </div>
      ) : null}
        {children}
      </div>
      <div className="cp-shield" aria-hidden="true" data-testid="cp-shield">
        <div className="rounded-xl border border-brand-100 bg-card px-6 py-4 text-center text-sm text-card-foreground shadow-sm">
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
          className="pointer-events-none fixed bottom-4 left-1/2 z-[70] -translate-x-1/2 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg"
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}
