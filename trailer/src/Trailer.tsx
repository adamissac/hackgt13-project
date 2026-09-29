import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import T from './timeline.json';
import {C} from './theme';
import {FontGate} from './fonts';
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

export type TrailerProps = {cut: 'main' | 'vertical'; music?: boolean; sfx?: boolean; musicFile?: string | null};

export const Trailer: React.FC<TrailerProps> = ({cut, music = true, sfx = true, musicFile = null}) => {
  const tl = (T as any)[cut];
  return (
    <AbsoluteFill style={{background: C.night}}>
      <FontGate>
        {tl.scenes.map((sc: any) => {
          const Comp = SCENES[sc.id];
          return (
            <Sequence key={sc.id} from={sc.from} durationInFrames={sc.dur} name={sc.id}>
              <Comp speed={sc.speed} {...(sc.props ?? {})} />
            </Sequence>
          );
        })}
      </FontGate>
      <AudioLayer cut={cut} music={music} sfx={sfx} musicFile={musicFile ?? (cut === 'main' ? 'audio/score-16x9.wav' : 'audio/score-9x16.wav')} />
    </AbsoluteFill>
  );
};
