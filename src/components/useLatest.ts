import { useLayoutEffect, useRef } from 'react';

/**
 * A ref that always holds the latest `value`, for listeners set up once (dialogs, popovers,
 * drag and drop) that must call the current callback without re-subscribing. Updated after
 * render, so it's never written during render; listeners only fire after that anyway.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
