'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const browserSnapshot = () => true;
const serverSnapshot = () => false;

// Keep JS-only form actions unavailable until React can handle submission.
export default function useHydrated() {
  return useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
}
