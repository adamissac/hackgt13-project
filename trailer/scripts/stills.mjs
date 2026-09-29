// Render review stills from the bundle: node scripts/stills.mjs '[["Trailer16x9",120],...]' out/stills 0.5
import path from 'node:path';
import fs from 'node:fs';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';

const list = JSON.parse(process.argv[2]);
const outDir = process.argv[3] || 'out/stills';
const scale = Number(process.argv[4] || 0.5);
const serveUrl = path.resolve('build');
const browserExecutable = process.env.REMOTION_CHROME || null;
fs.mkdirSync(outDir, {recursive: true});
const browser = await openBrowser('chrome', {browserExecutable, chromiumOptions: {gl: 'swangle'}});
const comps = {};
for (const [id, frame] of list) {
  const t0 = Date.now();
  comps[id] ??= await selectComposition({serveUrl, id, puppeteerInstance: browser, browserExecutable});
  await renderStill({composition: comps[id], serveUrl, frame, output: path.join(outDir, `${id}-${String(frame).padStart(4, '0')}.jpg`),
    imageFormat: 'jpeg', jpegQuality: 82, scale, puppeteerInstance: browser, browserExecutable, overwrite: true});
  console.log('still', id, frame, `${Date.now() - t0}ms`);
}
await browser.close({silent: true}).catch(() => undefined);
