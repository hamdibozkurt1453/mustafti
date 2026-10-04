"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { CloseIcon, MenuIcon } from "./icons";
import { NavLinks } from "./NavLinks";

/** قائمة ☰ للهاتف: تفتح لوحة أسفل الرأس، وتُغلق بالتنقل أو Escape. */
export function MobileMenu() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // أغلق القائمة عند تغيّر الصفحة.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? t("nav.closeMenu") : t("nav.openMenu")}
        className="flex h-10 w-10 items-center justify-center rounded-full text-ivory-50 hover:bg-ivory-50/10"
      >
        {open ? <CloseIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
      </button>

      {open && (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-16 border-t border-ivory-50/10 bg-green-900 px-4 pb-6 pt-3 shadow-lg"
        >
          <nav aria-label={t("nav.mainNav")}>
            <NavLinks variant="mobile" onNavigate={() => setOpen(false)} />
          </nav>
          <div className="mt-4 border-t border-ivory-50/10 pt-4">
            <Link
              href="/experts/join"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-4 py-3 text-ivory-50/85 hover:bg-ivory-50/5"
            >
              {t("footer.joinExpert")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
