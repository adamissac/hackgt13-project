// How far the on-screen keyboard overlaps the bottom of the screen (iOS), animated with the keyboard itself.
// Why not KeyboardAvoidingView: inside an iOS modal/page sheet it measures from the wrong origin, so a fixed
// keyboardVerticalOffset leaves the input under the keyboard. Android resizes the window itself (adjustResize),
// so this stays 0 there.
import { useEffect, useState } from 'react';
import { Keyboard, LayoutAnimation, Platform, type KeyboardEvent } from 'react-native';

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const animate = (e: KeyboardEvent) => {
      if (e.duration) {
        LayoutAnimation.configureNext({
          duration: e.duration,
          update: { duration: e.duration, type: LayoutAnimation.Types.keyboard },
        });
      }
    };
    const show = Keyboard.addListener('keyboardWillShow', (e) => {
      animate(e);
      setInset(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardWillHide', (e) => {
      animate(e);
      setInset(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return inset;
}
