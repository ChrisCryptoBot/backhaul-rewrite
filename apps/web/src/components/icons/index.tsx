import React from "react";

interface IconProps {
  size?: number;
  className?: string;
}

function baseProps(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    className
  };
}

export function CalendarIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 6.5h12M5 1.8v2.4M11 1.8v2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M4.5 6.2 8 9.8l3.5-3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M6.2 4.5 9.8 8l-3.6 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="m4 4 8 8M12 4 4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M3.5 8.2 6.8 11.2 12.5 4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function WarningIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M8 2.1 14 13H2L8 2.1Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 5.3v4.1M8 11.7v.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function SearchIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 10.5 13.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function UploadIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M8 11.7V3.2M8 3.2 5.2 6M8 3.2 10.8 6M3 12.7h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function ArrowUpIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M8 13V3M3 8l5-5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowDownIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M8 3v10M3 8l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DashIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
