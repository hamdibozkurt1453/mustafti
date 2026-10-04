import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/** روابط وتنقّل تراعي لغة الواجهة تلقائياً. */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
