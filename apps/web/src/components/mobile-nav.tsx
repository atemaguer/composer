"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type NavLink = {
  label: string;
  href: string;
};

export function MobileNav({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);

  // Close on Escape and lock nothing else — keep it lightweight.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        className="inline-flex size-8 items-center justify-center rounded-full border border-[#c9d2df] bg-white text-[#172033] transition hover:border-[#9aa8bb]"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
          {open ? (
            <path
              d="m4 4 8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M2.5 5h11M2.5 11h11"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default bg-[#101010]/20"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div
            id="mobile-menu"
            className="absolute inset-x-3 top-[64px] z-40 grid gap-1 rounded-2xl border border-[#d8dee8] bg-white p-2 shadow-xl shadow-[#172033]/10 sm:inset-x-8"
          >
            {links.map((link) =>
              link.href.startsWith("/") && !link.href.startsWith("/api/") ? (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-xl px-3 py-2.5 text-sm font-medium text-[#4c586d] transition hover:bg-[#f5f7fb] hover:text-[#172033]"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-xl px-3 py-2.5 text-sm font-medium text-[#4c586d] transition hover:bg-[#f5f7fb] hover:text-[#172033]"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </a>
              ),
            )}
          </div>
        </>
      )}
    </div>
  );
}
