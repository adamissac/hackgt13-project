import React, {useEffect, useState} from 'react';
import {continueRender, delayRender, staticFile} from 'remotion';

// Fonts ship in public/fonts so renders never depend on a network font CDN.
let ready: Promise<void> | null = null;
const load = () => {
  if (ready) return ready;
  const faces = [
    new FontFace('Inter', `url(${staticFile('fonts/inter-latin-wght-normal.woff2')}) format('woff2')`, {weight: '100 900'}),
    new FontFace('Inter', `url(${staticFile('fonts/inter-latin-ext-wght-normal.woff2')}) format('woff2')`, {weight: '100 900', unicodeRange: 'U+0100-024F, U+1E00-1EFF'}),
    new FontFace('Space Mono', `url(${staticFile('fonts/SpaceMono-Regular.ttf')}) format('truetype')`, {weight: '400'}),
  ];
  ready = Promise.all(faces.map((face) => face.load().then((loaded) => { (document.fonts as any).add(loaded); })))
    .then(() => undefined)
    .catch((e) => console.error('Font load failed', e));
  return ready;
};

/** Renders children only after fonts load, so text measurement and layout are final. */
export const FontGate: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [handle] = useState(() => delayRender('Loading fonts'));
  const [ok, setOk] = useState(false);
  useEffect(() => { load().then(() => setOk(true)); }, []);
  useEffect(() => { if (ok) continueRender(handle); }, [ok, handle]);
  return ok ? <>{children}</> : null;
};
