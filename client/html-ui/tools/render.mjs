// node tools/render.mjs <page path or URL> <out.png> [js to run first]: one headless screenshot at 1024x768, DPR 1
// (the same Chrome, flags and static server as diff.mjs).
import { open } from './browser.mjs';
const [page, out, js] = process.argv.slice(2);
const b = await open();
await b.shot(page, out, js);
b.close();
