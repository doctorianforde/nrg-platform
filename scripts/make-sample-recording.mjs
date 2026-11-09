// Makes a narrated slide video from a script in docs/phase-1/sample-recordings/<slug>.json (macOS only: uses `say`).
//   PLAYWRIGHT=/path/to/playwright-core/index.mjs node scripts/make-sample-recording.mjs <script.json> <out dir>
// Writes <out>/<slug>.mp4 (H.264 + AAC, 1280x720, fast start), <slug>-thumb.jpg, and <slug>.meta.json with the length,
// chapters (one per slide) and a timed transcript (one line per sentence, timed within its slide by length).
// Needs ffmpeg/ffprobe on PATH. The videos are samples for Jade's review, not teaching content.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const [scriptPath, outDir] = process.argv.slice(2);
if (!scriptPath || !outDir) throw new Error("usage: make-sample-recording.mjs <script.json> <out dir>");
const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");
const spec = JSON.parse(readFileSync(scriptPath, "utf8"));
const work = path.join(outDir, `${spec.slug}-work`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const VOICE = process.env.VOICE ?? "Samantha";
const RATE = process.env.RATE ?? "172";
const PAD = 0.9; // seconds of quiet after each slide's narration
const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", f]).toString().trim());

const css = `
*{box-sizing:border-box}body{margin:0;width:1280px;height:720px;font-family:"Helvetica Neue",Arial,sans-serif;color:#241a33;background:#f6f4f8}
.slide{position:relative;width:1280px;height:720px;padding:64px 80px 72px;display:flex;flex-direction:column}
.slide:before{content:"";position:absolute;inset:0 0 auto;height:10px;background:linear-gradient(90deg,#4a1d6a,#6b2d8b,#8b6ba8)}
h1{font-size:46px;line-height:1.1;margin:0 0 28px;color:#4a1d6a;letter-spacing:-.01em}
.cover{background:linear-gradient(135deg,#3b1557,#5b2a86 60%,#7d5aa2);color:#fff;justify-content:center}
.cover h1{color:#fff;font-size:64px;max-width:980px}
.cover .lead{color:#efe7f7}.cover .muted{color:#d9c8ec}
p,li,td,th{font-size:28px;line-height:1.4}p{margin:0 0 16px}
.lead{font-size:34px;font-weight:600;color:#4a1d6a}.muted{color:#6b6080;font-size:24px}
table{border-collapse:collapse;width:100%;margin-top:4px}th{background:#5b2a86;color:#fff;text-align:left;padding:12px 16px;font-size:24px}
td{padding:12px 16px;border-bottom:2px solid #e2dce9;font-size:26px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:40px}.two h3{font-size:30px;margin:0 0 12px;color:#5b2a86}
.rule{margin-top:28px;background:#efe7f7;border-radius:14px;padding:16px 22px;font-size:30px}
.scale{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin:8px 0 28px}.scale span{border-radius:16px;padding:22px;font-size:26px;text-align:center}
.acid{background:#fbe6e9;color:#8c1d2c}.norm{background:#e3f3ea;color:#1f6a40}.base{background:#e3eefb;color:#1d4f88}.scale b{font-size:34px}
.gas{font-family:Menlo,monospace;font-size:34px;background:#241a33;color:#fff;border-radius:14px;padding:18px 24px;display:inline-block}
ul,ol{margin:0;padding-left:34px}li{margin:6px 0}
.chips{display:flex;flex-wrap:wrap;gap:14px}.chips span{background:#efe7f7;color:#4a1d6a;border-radius:99px;padding:12px 22px;font-size:26px;font-weight:600}
.foot{position:absolute;left:80px;right:80px;bottom:26px;display:flex;justify-content:space-between;font-size:18px;color:#8a7f99}
.cover .foot{color:#d9c8ec}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const segments = [], chapters = [], transcript = [];
let t = 0;
for (const [i, s] of spec.slides.entries()) {
  const html = `<!doctype html><meta charset="utf-8"><style>${css}</style><div class="slide${s.cover ? " cover" : ""}"><h1>${s.title}</h1>${s.body}<div class="foot"><span>NRG Platform · ${spec.title}</span><span>${i + 1} / ${spec.slides.length}</span></div></div>`;
  await page.setContent(html);
  const png = path.join(work, `s${i}.png`);
  await page.screenshot({ path: png });
  const aiff = path.join(work, `s${i}.aiff`);
  execFileSync("say", ["-v", VOICE, "-r", RATE, "-o", aiff, s.narration]);
  const speech = dur(aiff);
  const len = speech + PAD;
  const seg = path.join(work, `s${i}.mp4`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-framerate", "24", "-i", png, "-i", aiff,
    "-af", `apad=whole_dur=${len.toFixed(3)}`, "-t", len.toFixed(3),
    "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p", "-r", "24", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", seg]);
  segments.push(seg);
  chapters.push({ start: Math.round(t), title: s.chapter ?? s.title });
  // Transcript: split the narration into sentences, timed within the slide by their share of the characters.
  const sentences = s.narration.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean); // not on decimals like 7.35
  const total = sentences.reduce((n, x) => n + x.length, 0);
  let at = t;
  for (const x of sentences) { transcript.push({ t: Math.round(at), text: x.trim() }); at += (x.length / total) * speech; }
  if (i === 0) execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", png, "-vf", "scale=640:360", "-q:v", "3", path.join(outDir, `${spec.slug}-thumb.jpg`)]);
  t += len;
}
await browser.close();

const list = path.join(work, "list.txt");
writeFileSync(list, segments.map((s) => `file '${s}'`).join("\n"));
const mp4 = path.join(outDir, `${spec.slug}.mp4`);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", mp4]);
const meta = { slug: spec.slug, duration_seconds: Math.round(dur(mp4)), chapters, transcript };
writeFileSync(path.join(outDir, `${spec.slug}.meta.json`), JSON.stringify(meta, null, 2));
rmSync(work, { recursive: true, force: true });
console.log(`wrote ${mp4} (${meta.duration_seconds}s, ${chapters.length} chapters, ${transcript.length} transcript lines)`);
