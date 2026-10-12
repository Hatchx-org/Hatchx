import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;
type LogoProps = { className?: string; variant?: "auto" | "light" | "dark" };

export function LogoMark({ className = "", variant = "auto" }: LogoProps) {
  return (
    <span className={`brand-logo brand-logo-variant-${variant} ${className}`} aria-hidden />
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <path d="M3 9.2 10 3l7 6.2v7a1.8 1.8 0 0 1-1.8 1.8h-10A1.8 1.8 0 0 1 3 16.2v-7Z" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="14" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function MegaphoneIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <path d="M3 9h2.5L13 4.5v11L5.5 11H3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M13 7l4 1.3v3.4L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M6.5 15.5a2 2 0 0 0 2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ClubsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <circle cx="10" cy="6" r="2.7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="4.7" cy="8.3" r="1.8" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="15.3" cy="8.3" r="1.8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 16.5c.3-3.1 2.4-5 6-5s5.7 1.9 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M1.8 15.7c.1-2.2 1.3-3.5 3.4-3.8M18.2 15.7c-.1-2.2-1.3-3.5-3.4-3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <rect x="2.5" y="3.5" width="15" height="13.5" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 7.5h15" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 2.5v2.5M13.5 2.5v2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="6.5" y="10.5" width="3" height="3" rx="0.5" fill="currentColor" />
      <rect x="11.5" y="10.5" width="3" height="3" rx="0.5" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

export function MediaIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <rect x="2.5" y="3" width="15" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="13.5" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m4.5 15 4.1-4 2.5 2.2 1.7-1.6 2.7 3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AttendanceIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <rect x="3" y="2.5" width="14" height="15" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 2.5h6v3H7z" fill="currentColor" opacity=".25" />
      <path d="m6.2 11 2.1 2.1 5.5-5.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function NotificationIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <path d="M5.2 8.2a4.8 4.8 0 0 1 9.6 0v2.5c0 .9.3 1.8.9 2.5l.8.9H3.5l.8-.9c.6-.7.9-1.6.9-2.5V8.2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 16a2.2 2.2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function OpportunitiesIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <path d="M10 2.5 12 7l5 .4-3.8 3.2 1.2 4.9L10 12.7l-4.4 2.8 1.2-4.9L3 7.4 8 7l2-4.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function SupportIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 14v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="6.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <rect x="2.5" y="2.5" width="15" height="15" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="6.5" r="1.2" fill="currentColor" />
      <path d="M10 9.5V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function AdminIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <rect x="3" y="3" width="2.2" height="14" rx="0.6" fill="currentColor" />
      <rect x="8.9" y="3" width="2.2" height="9.5" rx="0.6" fill="currentColor" opacity="0.7" />
      <rect x="14.8" y="3" width="2.2" height="6" rx="0.6" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 1.8v2.2M10 16v2.2M1.8 10h2.2M16 10h2.2M4.2 4.2l1.6 1.6M14.2 14.2l1.6 1.6M15.8 4.2l-1.6 1.6M5.8 14.2l-1.6 1.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <circle cx="10" cy="7" r="3.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 17.2a6 6 0 0 1 12 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m13.5 13.5 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden {...props}>
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 10h7M11 7.5 13.5 10 11 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
