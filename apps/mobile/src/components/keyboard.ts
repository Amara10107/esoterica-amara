/** Mantiene a la vista el campo con foco cuando se abre el teclado (v2.3.4). Se usa en pantallas, hojas y ventanas con formulario. */
import React from 'react';
import { Keyboard, Platform, TextInput } from 'react-native';
import type { ScrollView } from 'react-native';

type Focused = { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null | undefined;

export function useKeyboardScroll(): { ref: React.RefObject<ScrollView | null>; onScroll: (e: { nativeEvent: { contentOffset: { y: number } } }) => void } {
  const ref = React.useRef<ScrollView | null>(null);
  const offset = React.useRef(0);
  React.useEffect(() => {
    const sub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      const focused = (TextInput as unknown as { State?: { currentlyFocusedInput?: () => Focused } }).State?.currentlyFocusedInput?.();
      if (!focused?.measureInWindow) return;
      setTimeout(() => {
        focused.measureInWindow?.((_x, y, _w, h) => {
          const overflow = y + h - (e.endCoordinates.screenY - 16);
          if (overflow > 0) ref.current?.scrollTo({ y: offset.current + overflow + 24, animated: true });
        });
      }, 150);
    });
    return () => sub.remove();
  }, []);
  return { ref, onScroll: (e) => { offset.current = e.nativeEvent.contentOffset.y; } };
}
