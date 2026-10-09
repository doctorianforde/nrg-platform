"use client";

import { useCallback, useEffect, useState } from "react";

type Op = "+" | "−" | "×" | "÷";

/** Trim floating-point noise (0.1 + 0.2) without hiding real precision. */
const clean = (n: number) => (Number.isFinite(n) ? String(parseFloat(n.toPrecision(12))) : "Error");
const apply = (a: number, b: number, op: Op) => (op === "+" ? a + b : op === "−" ? a - b : op === "×" ? a * b : b === 0 ? NaN : a / b);

/** A basic four-function calculator (with %, ± and backspace) for dose and fluid calculations. Keyboard works while it is open. */
export function Calculator({ onClose }: { onClose: () => void }) {
  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [fresh, setFresh] = useState(true); // the next digit starts a new number
  const [expr, setExpr] = useState("");

  const error = display === "Error";
  const digit = useCallback((d: string) => {
    if (error) { setDisplay(d === "." ? "0." : d); setFresh(false); return; }
    if (fresh) { setDisplay(d === "." ? "0." : d); setFresh(false); return; }
    if (d === "." && display.includes(".")) return;
    if (display.replace(/[-.]/g, "").length >= 15) return;
    setDisplay(display === "0" && d !== "." ? d : display + d);
  }, [display, fresh, error]);

  const operator = useCallback((next: Op) => {
    if (error) return;
    const cur = parseFloat(display);
    if (acc !== null && op && !fresh) {
      const r = clean(apply(acc, cur, op));
      setDisplay(r); setAcc(r === "Error" ? null : parseFloat(r)); setExpr(r === "Error" ? "" : `${r} ${next}`);
    } else { setAcc(cur); setExpr(`${clean(cur)} ${next}`); }
    setOp(next); setFresh(true);
  }, [acc, op, display, fresh, error]);

  const equals = useCallback(() => {
    if (acc === null || !op || error) return;
    const cur = parseFloat(display);
    const r = clean(apply(acc, cur, op));
    setExpr(`${clean(acc)} ${op} ${clean(cur)} =`);
    setDisplay(r); setAcc(null); setOp(null); setFresh(true);
  }, [acc, op, display, error]);

  const clear = () => { setDisplay("0"); setAcc(null); setOp(null); setFresh(true); setExpr(""); };
  const back = useCallback(() => { if (fresh || error) return; setDisplay(display.length > 1 && !(display.length === 2 && display.startsWith("-")) ? display.slice(0, -1) : "0"); }, [display, fresh, error]);
  const negate = () => { if (!error && display !== "0") setDisplay(display.startsWith("-") ? display.slice(1) : "-" + display); };
  // % follows the usual calculator convention: of the running total for + and −, otherwise divide by 100.
  const percent = () => {
    if (error) return;
    const cur = parseFloat(display);
    setDisplay(clean(acc !== null && (op === "+" || op === "−") ? (acc * cur) / 100 : cur / 100)); setFresh(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (/^[0-9.]$/.test(k)) digit(k);
      else if (k === "+") operator("+");
      else if (k === "-") operator("−");
      else if (k === "*" || k === "x") operator("×");
      else if (k === "/") operator("÷");
      else if (k === "Enter" || k === "=") equals();
      else if (k === "Backspace") back();
      else if (k === "Escape") onClose();
      else if (k === "c" || k === "C" || k === "Delete") clear();
      else if (k === "%") percent();
      else return;
      e.preventDefault(); e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const key = "rounded-md border border-border bg-card py-2.5 text-base font-medium text-card-foreground hover:bg-muted active:bg-brand-50";
  const opKey = "rounded-md border border-brand-200 bg-brand-50 py-2.5 text-base font-semibold text-brand-800 hover:bg-brand-100";
  return (
    <div role="dialog" aria-label="Calculator" className="w-72 rounded-xl border border-border bg-card p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Calculator</span>
        <button type="button" onClick={onClose} aria-label="Close calculator" className="rounded px-2 text-lg leading-none text-muted-foreground hover:bg-muted">×</button>
      </div>
      <div className="mb-3 rounded-md bg-muted px-3 py-2 text-right">
        <div className="h-4 truncate text-xs text-muted-foreground">{expr}</div>
        <div className="truncate font-mono text-2xl text-card-foreground" aria-live="polite">{display}</div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        <button type="button" className={key} onClick={clear}>C</button>
        <button type="button" className={key} onClick={back} aria-label="Backspace">⌫</button>
        <button type="button" className={key} onClick={percent}>%</button>
        <button type="button" className={opKey} onClick={() => operator("÷")}>÷</button>
        {["7", "8", "9"].map((d) => <button type="button" key={d} className={key} onClick={() => digit(d)}>{d}</button>)}
        <button type="button" className={opKey} onClick={() => operator("×")}>×</button>
        {["4", "5", "6"].map((d) => <button type="button" key={d} className={key} onClick={() => digit(d)}>{d}</button>)}
        <button type="button" className={opKey} onClick={() => operator("−")}>−</button>
        {["1", "2", "3"].map((d) => <button type="button" key={d} className={key} onClick={() => digit(d)}>{d}</button>)}
        <button type="button" className={opKey} onClick={() => operator("+")}>+</button>
        <button type="button" className={key} onClick={negate} aria-label="Change sign">±</button>
        <button type="button" className={key} onClick={() => digit("0")}>0</button>
        <button type="button" className={key} onClick={() => digit(".")}>.</button>
        <button type="button" className="rounded-md bg-primary py-2.5 text-base font-semibold text-primary-foreground hover:bg-brand-800" onClick={equals}>=</button>
      </div>
    </div>
  );
}
