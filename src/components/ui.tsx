"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronIcon } from "./icons";

type ButtonVariant = "primary" | "secondary" | "ghost" | "peach" | "dark";
type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-navy text-cream hover:bg-navy-dark",
  secondary: "bg-content-bg text-ink hover:bg-cream/10",
  ghost: "bg-transparent text-ink hover:bg-cream/10",
  peach: "bg-peach text-black hover:bg-peach/90",
  dark: "bg-[#141414] text-cream hover:bg-black",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3.5 text-xs",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-7 text-base",
};

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold shadow-sm transition-all hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:pointer-events-none disabled:opacity-50";

export function Button({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: {
  href?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
} & (React.ButtonHTMLAttributes<HTMLButtonElement> | React.AnchorHTMLAttributes<HTMLAnchorElement>)) {
  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
  if (href) {
    return (
      <Link href={href} className={classes} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={`page-title-card mb-8 ${className ?? ""}`}>
      {eyebrow && (
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-orange">{eyebrow}</p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-1 font-display text-4xl font-bold uppercase tracking-tight text-ink sm:text-5xl">
            {title}
          </h1>
          {subtitle && <p className="mt-3 max-w-3xl text-base leading-7 text-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-line bg-card/60 px-6 py-14 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export type MenuItem = { href: string; label: string };

export function DropdownMenu({
  label,
  items,
  align = "left",
  className = "",
}: {
  label: string;
  items: MenuItem[];
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`group/me relative ${className}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy ${
          open ? "bg-navy text-cream" : "text-ink hover:bg-cream/10"
        }`}
      >
        {label}
        <ChevronIcon className={`h-3.5 w-3.5 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        role="menu"
        hidden={!open}
        className={`absolute top-full z-50 mt-1 min-w-52 rounded-light border border-line bg-card p-1.5 shadow-xl ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-control px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-content-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
