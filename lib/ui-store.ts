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

/**
 * F1: الشعار يعيد إلى الرئيسية من أي حالة. الضغط عليه يرفع «طلب الرئيسية»، والرئيسية تستهلكه
 * فتمسح المحادثة الجارية وتعرض الواجهة الأولى (ولو كان السائل في الرئيسية نفسها، حيث لا ينتقل الرابط).
 */
let homeRequests = 0;
let homeHandled = 0;
const homeListeners = new Set<() => void>();

export function requestHome() {
  homeRequests += 1;
  homeListeners.forEach((l) => l());
}

/** هل في الانتظار طلب لم يُستهلك؟ يستهلكه إن وُجد. */
export function consumeHomeRequest(): boolean {
  if (homeHandled === homeRequests) return false;
  homeHandled = homeRequests;
  return true;
}

export function useHomeRequests() {
  return useSyncExternalStore(
    (listener) => {
      homeListeners.add(listener);
      return () => homeListeners.delete(listener);
    },
    () => homeRequests,
    () => 0,
  );
}
