// Bundle once, then render many chunks or stills from the same bundle.
import path from 'node:path';
import {bundle} from '@remotion/bundler';

const outDir = path.resolve('build');
await bundle({entryPoint: path.resolve('src/index.ts'), outDir, onProgress: () => undefined});
console.log('bundled to', outDir);
