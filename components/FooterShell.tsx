"use client";

import type { ReactNode } from "react";
import { useChatMode } from "@/lib/ui-store";

/** يخفي التذييل في وضع المحادثة حتى تبقى الشاشة للحوار. */
export function FooterShell({ children }: { children: ReactNode }) {
  return useChatMode() ? null : <>{children}</>;
}
