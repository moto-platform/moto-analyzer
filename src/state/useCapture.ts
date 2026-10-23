import { useSyncExternalStore } from 'react';
import { CaptureStore } from './captureStore';

/** Re-renders the caller whenever the store changed (at most once per animation frame). */
export function useCapture(store: CaptureStore): number {
  return useSyncExternalStore(store.subscribe, store.getVersion);
}
