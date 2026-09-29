import {useVideoConfig} from 'remotion';

export const useLayout = () => {
  const {width: W, height: H} = useVideoConfig();
  return {W, H, portrait: H > W};
};
