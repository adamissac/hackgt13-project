import React from 'react';
import {Composition} from 'remotion';
import T from './timeline.json';
import {Trailer} from './Trailer';
import {Sting} from './scenes/Sting';

export const Root: React.FC = () => (
  <>
    <Composition id="Trailer16x9" component={Trailer} durationInFrames={T.main.duration} fps={30} width={1920} height={1080}
      defaultProps={{cut: 'main' as const, music: true, sfx: true, musicFile: null as string | null}} />
    <Composition id="Trailer9x16" component={Trailer} durationInFrames={T.vertical.duration} fps={30} width={1080} height={1920}
      defaultProps={{cut: 'vertical' as const, music: true, sfx: true, musicFile: null as string | null}} />
    <Composition id="Sting" component={Sting} durationInFrames={90} fps={30} width={1920} height={1080} />
  </>
);
