import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import T from './timeline.json';
import {C} from './theme';
import {FontGate} from './fonts';
import {tw, outExpo} from './motion';
import {BeatCtx, punch, flash, Cut} from './beat';
import {AudioLayer} from './components/AudioLayer';
import {Opening} from './scenes/Opening';
import {You} from './scenes/You';
import {Matches} from './scenes/Matches';
import {Meet} from './scenes/Meet';
import {Proof} from './scenes/Proof';
import {Montage} from './scenes/Montage';
import {Constellation} from './scenes/Constellation';
import {Finale} from './scenes/Finale';

const SCENES: Record<string, React.FC<any>> = {
  opening: Opening, you: You, matches: Matches, meet: Meet, proof: Proof, montage: Montage, constellation: Constellation, finale: Finale,
};

/** Scenes that start on a hard cut land with a quick zoom settle on the downbeat. */
const SceneWrap: React.FC<{zoomIn?: boolean; children: React.ReactNode}> = ({zoomIn, children}) => {
  const f = useCurrentFrame();
  const z = zoomIn ? 1 + 0.1 * (1 - tw(f, 0, 14, 0, 1, outExpo)) : 1;
  return <AbsoluteFill style={{transform: z !== 1 ? `scale(${z})` : undefined}}>{children}</AbsoluteFill>;
};

export type TrailerProps = {cut: Cut; music?: boolean; sfx?: boolean; musicFile?: string | null};

export const Trailer: React.FC<TrailerProps> = ({cut, music = true, sfx = true, musicFile = null}) => {
  const g = useCurrentFrame();
  const tl = (T as any)[cut];
  const p = punch(cut, g);
  const fl = flash(cut, g);
  return (
    <AbsoluteFill style={{background: C.night}}>
      <BeatCtx.Provider value={{g, cut}}>
        <AbsoluteFill style={{transform: p ? `scale(${1 + p})` : undefined}}>
          <FontGate>
            {tl.scenes.map((sc: any) => {
              const Comp = SCENES[sc.id];
              return (
                <Sequence key={sc.id} from={sc.from} durationInFrames={sc.dur} name={sc.id}>
                  <SceneWrap zoomIn={sc.zoomIn}><Comp speed={sc.speed} {...(sc.props ?? {})} /></SceneWrap>
                </Sequence>
              );
            })}
          </FontGate>
        </AbsoluteFill>
      </BeatCtx.Provider>
      {fl > 0.01 && (
        <AbsoluteFill style={{pointerEvents: 'none', opacity: fl,
          background: 'radial-gradient(circle at 50% 45%, rgba(225,234,255,0.95) 0%, rgba(183,207,255,0.35) 45%, rgba(183,207,255,0) 78%)'}} />
      )}
      <AudioLayer cut={cut} music={music} sfx={sfx} musicFile={musicFile ?? (cut === 'main' ? 'audio/score-16x9.wav' : 'audio/score-9x16.wav')} />
    </AbsoluteFill>
  );
};
