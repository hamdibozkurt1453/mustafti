"use client";

import { useSyncExternalStore } from "react";

/**
 * حالة واجهة صغيرة مشتركة بين الصفحة الرئيسية والإطار:
 * عند بدء المحادثة يصبح الرأس داكناً ثابتاً ويختفي التذييل.
 */
let chatMode = false;
const listeners = new Set<() => void>();

export function setChatMode(value: boolean) {
  if (chatMode === value) return;
  chatMode = value;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useChatMode() {
  return useSyncExternalStore(subscribe, () => chatMode, () => false);
}
