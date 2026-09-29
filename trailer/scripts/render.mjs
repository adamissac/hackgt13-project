// Render a frame range of a composition from the bundle, video only: node scripts/render.mjs Trailer16x9 0 599 out/parts/a.mp4
import path from 'node:path';
import {openBrowser, renderMedia, selectComposition} from '@remotion/renderer';

const [id, from, to, output] = process.argv.slice(2);
const serveUrl = path.resolve('build');
const browserExecutable = process.env.REMOTION_CHROME || null;
const t0 = Date.now();
const browser = await openBrowser('chrome', {browserExecutable, chromiumOptions: {gl: 'swangle'}});
const composition = await selectComposition({serveUrl, id, puppeteerInstance: browser, browserExecutable});
let last = 0;
await renderMedia({
  composition, serveUrl, codec: 'h264', outputLocation: output, frameRange: [Number(from), Number(to)], muted: true,
  concurrency: 1, crf: 18, imageFormat: 'jpeg', jpegQuality: 92, puppeteerInstance: browser, browserExecutable, overwrite: true,
  onProgress: ({renderedFrames}) => {
    if (renderedFrames - last >= 120) { last = renderedFrames; console.log('frames', renderedFrames, `${((Date.now() - t0) / 1000).toFixed(0)}s`); }
  },
});
console.log('done', output, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
await browser.close({silent: true}).catch(() => undefined);
