"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: "⌂" },
  { href: "/meals/new", label: "Log meal", icon: "+" },
  { href: "/meals/new?mode=recipes", label: "Recipes", icon: "▣" },
];

export default function AppShell({
  children,
  activeSection,
}: {
  children: ReactNode;
  activeSection?: "meals" | "recipes";
}) {
  const pathname = usePathname();
  const recipeMode = activeSection === "recipes";
  function isActive(href: string) {
    const [path, query] = href.split("?");
    if (pathname !== path) return false;
    if (query === "mode=recipes") return recipeMode;
    return !recipeMode;
  }
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white px-5 py-6 lg:block">
        <Link
          href="/dashboard"
          className="block px-3 text-2xl font-bold tracking-tight text-green-800"
        >
          NutriLog
        </Link>
        <nav className="mt-10 space-y-2" aria-label="Primary navigation">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 font-medium ${isActive(link.href) ? "bg-green-50 text-green-800" : "text-slate-600 hover:bg-slate-50"}`}
            >
              <span aria-hidden="true" className="text-lg">
                {link.icon}
              </span>
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="absolute bottom-6 px-3 text-xs text-slate-400">
          Nutrition tracking made simple.
        </p>
      </aside>
      <div className="min-w-0 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:ml-64 lg:pb-0">
        {children}
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
        aria-label="Mobile navigation"
      >
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-xs font-medium ${isActive(link.href) ? "text-green-800" : "text-slate-500"}`}
          >
            <span aria-hidden="true" className="text-lg">
              {link.icon}
            </span>
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
