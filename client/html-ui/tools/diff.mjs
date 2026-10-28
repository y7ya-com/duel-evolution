// Pixel diff of the HTML recreation against the game's golden frames.
//   node tools/diff.mjs [page=login.html] [goldenDir=golden] [outDir=diff] [--tol=N]
// For each golden/<state>.json: headless Chrome for Testing renders <page> at 1024x768, DPR 1, with the widget state and
// the golden's own backdrop (<state>-bg.png: the same game frame before the dialog's first draw), screenshots it, and
// compares it with <state>.png in the page (canvas pixels, no colour management: every PNG here is untagged sRGB).
// Stats are over the whole frame and over the dialog (the union of the logged dialog draws); "outside text" leaves out
// the glyph cells; a golden with "compare": [[x0,y0,x1,y1], ...] is compared there only. Writes <outDir>/<state>.png (render), <state>-heat.png, report.json, report.md.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { open, ROOT } from './browser.mjs';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const TOL = +(process.argv.find(a => a.startsWith('--tol='))?.slice(6) ?? 2);
const PAGE = args[0] || 'login.html', GOLD = args[1] || 'golden', OUT = join(ROOT, args[2] || 'diff');
mkdirSync(OUT, { recursive: true });
const B = await open(), BASE = B.base, ev = B.ev;

// dialog region and glyph cells of a golden, from its logged draws: everything after the backdrop, before the cursor
function regions(draws) {
  const d = draws.draws, first = d.findIndex(x => x.tw === 128 && x.th === 32);
  const dialog = [], text = [];
  for (const x of d.slice(first)) {
    if (x.tw === 64 && x.th === 64) break;   // mausuk_*: the mouse cursor
    for (let q = 0; q < x.vs.length; q += 6) {
      const Q = x.vs.slice(q, q + 6), r = [Math.min(...Q.map(v => v[0])), Math.min(...Q.map(v => v[1])), Math.max(...Q.map(v => v[0])), Math.max(...Q.map(v => v[1]))];
      dialog.push(r);
      if (x.tw === 256 && x.th === 256) text.push(r);
    }
  }
  return { dialog, text };
}

const states = readdirSync(join(ROOT, GOLD)).filter(f => /^[\w-]+\.json$/.test(f) && !f.endsWith('.draws.json')).map(f => f.slice(0, -5)).sort();
const report = { page: PAGE, tolerance: TOL, chrome: B.version, states: {} };
for (const s of states) {
  const state = JSON.parse(readFileSync(join(ROOT, GOLD, s + '.json')));
  const shot = await B.shot(PAGE, join(OUT, s + '.png'), `window.__state(${JSON.stringify({ ...state, bg: state.bg || `${GOLD}/${s}-bg.png` })})`);
  // compare: the golden's own list of rects (a frame with no backdrop read-back: only what the backdrop can't reach)
  const reg = state.compare ? { dialog: state.compare, text: [] }
    : existsSync(join(ROOT, GOLD, s + '.draws.json')) ? regions(JSON.parse(readFileSync(join(ROOT, GOLD, s + '.draws.json')))) : null;
  const r = await ev(`(async () => {
    const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
    const px = img => { const c = new OffscreenCanvas(1024, 768), x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, 1024, 768).data; };
    const a = px(await load(${JSON.stringify(BASE + GOLD + '/' + s + '.png')})), b = px(await load('data:image/png;base64,${shot}'));
    const reg = ${JSON.stringify(reg)}, inR = (rs, x, y) => rs && rs.some(r => x >= r[0] && x < r[2] && y >= r[1] && y < r[3]);
    const mk = () => ({ n: 0, same: 0, tol: 0, max: 0 }), all = mk(), dlg = mk(), dlgNoText = mk();
    const heat = new ImageData(1024, 768), worst = [];
    for (let y = 0; y < 768; y++) for (let x = 0; x < 1024; x++) {
      const i = (y * 1024 + x) * 4, e = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
      const D = !reg || inR(reg.dialog, x, y), T = reg && inR(reg.text, x, y);
      for (const s of [all, D && dlg, D && !T && dlgNoText]) if (s) { s.n++; if (!e) s.same++; if (e <= ${TOL}) s.tol++; if (e > s.max) s.max = e; }
      if (e > ${TOL} && worst.length < 20) worst.push([x, y, e, [a[i], a[i + 1], a[i + 2]], [b[i], b[i + 1], b[i + 2]]]);
      // heatmap: the golden in dim grey, identical; tolerance-only differences yellow; beyond it red, brighter = larger;
      // outside a golden's "compare" rects, blue
      const g = (a[i] + a[i + 1] + a[i + 2]) / 12 | 0;
      heat.data.set(reg && !D && ${!!state.compare} ? [g / 2, g / 2, 40 + g, 255]   // not compared (blue)
        : !e ? [g, g, g, 255] : e <= ${TOL} ? [200, 200, 0, 255] : [Math.min(255, 120 + e * 4), 0, 0, 255], i);
    }
    const c = new OffscreenCanvas(1024, 768); c.getContext('2d').putImageData(heat, 0, 0);
    const blob = await c.convertToBlob({ type: 'image/png' }), u8 = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; for (let k = 0; k < u8.length; k += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(k, k + 0x8000));
    const pct = s => ({ pixels: s.n, identical: +(100 * s.same / s.n).toFixed(4), withinTol: +(100 * s.tol / s.n).toFixed(4), maxErr: s.max });
    return { all: pct(all), dialog: pct(dlg), dialogOutsideText: pct(dlgNoText), worst, heat: btoa(bin) };
  })()`);
  writeFileSync(join(OUT, s + '-heat.png'), Buffer.from(r.heat, 'base64'));
  delete r.heat;
  report.states[s] = r;
  console.log(s.padEnd(18), 'frame', r.all.identical + '%', '| dialog', r.dialog.identical + '% identical,', r.dialog.withinTol + '% <=' + TOL + ', max', r.dialog.maxErr, '| outside text: max', r.dialogOutsideText.maxErr);
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
const rows = Object.entries(report.states).map(([s, r]) => `| ${s} | ${r.all.identical} | ${r.dialog.identical} | ${r.dialog.withinTol} | ${r.dialog.maxErr} | ${r.dialogOutsideText.withinTol} | ${r.dialogOutsideText.maxErr} |`);
writeFileSync(join(OUT, 'report.md'), `# ${PAGE} vs ${GOLD}/ (tolerance ${TOL}, ${report.chrome})\n\n` +
  `| state | frame identical % | dialog identical % | dialog within ±${TOL} % | dialog max err | outside text within ±${TOL} % | outside text max err |\n|---|---|---|---|---|---|---|\n` + rows.join('\n') + '\n');
B.close();
process.exit(0);
