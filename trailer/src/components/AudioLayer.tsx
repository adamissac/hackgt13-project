import React from 'react';
import {Audio, Sequence, staticFile} from 'remotion';
import cues from '../audio/cues.json';

/** Score bed plus individually timed sound effects. Pass musicFile (e.g. "music.mp3" in public/) to swap the bed. */
export const AudioLayer: React.FC<{cut: 'main' | 'vertical'; music?: boolean; sfx?: boolean; musicFile?: string | null; musicVolume?: number}> = ({
  cut, music = true, sfx = true, musicFile, musicVolume = 0.85,
}) => (
  <>
    {music && musicFile ? <Audio src={staticFile(musicFile)} volume={musicVolume} /> : null}
    {sfx
      ? ((cues as any)[cut] as [number, string, number][]).map(([fr, name, g], i) => (
          <Sequence key={i} from={fr} durationInFrames={75} layout="none">
            <Audio src={staticFile(`sfx/${name}.wav`)} volume={g} />
          </Sequence>
        ))
      : null}
  </>
);
