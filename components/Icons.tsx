/** Premium stroke icons — shared across login, setel, riwayat, dll. */

type Props = { size?: number; className?: string };

function base(size: number, className: string | undefined, children: React.ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconUser({ size = 16, className }: Props) {
  return base(size, className, (
    <>
      <circle cx="12" cy="8.5" r="3.4" />
      <path d="M5.5 19c1.2-2.8 3.4-4.2 6.5-4.2s5.3 1.4 6.5 4.2" />
    </>
  ));
}

export function IconMail({ size = 16, className }: Props) {
  return base(size, className, (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M4 7.5l8 5.5 8-5.5" />
    </>
  ));
}

export function IconLock({ size = 16, className }: Props) {
  return base(size, className, (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ));
}

export function IconEye({ size = 16, className, open = true }: Props & { open?: boolean }) {
  if (open) {
    return base(size, className, (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ));
  }
  return base(size, className, (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-1.2" />
      <path d="M9.9 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 3.8M6.1 6.1A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 4.2-.9" />
    </>
  ));
}

export function IconKey({ size = 16, className }: Props) {
  return base(size, className, (
    <>
      <circle cx="8" cy="14" r="3.5" />
      <path d="M11 12.5L19 4.5M16 4.5h3v3" />
    </>
  ));
}

export function IconSparkle({ size = 16, className }: Props) {
  return base(size, className, (
    <>
      <path d="M12 3l1.2 5.3L18 12l-4.8 1.7L12 21l-1.2-7.3L6 12l4.8-1.7L12 3z" />
    </>
  ));
}

export function IconCalc({ size = 16, className }: Props) {
  return base(size, className, (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 8h8M8 12h2M12 12h2M16 12h1M8 16h2M12 16h2" />
    </>
  ));
}

export function IconRefresh({ size = 16, className }: Props) {
  return base(size, className, (
    <>
      <path d="M4 12a8 8 0 0 1 13.5-5.8" />
      <path d="M20 6v4.5H15.5" />
      <path d="M20 12a8 8 0 0 1-13.5 5.8" />
      <path d="M4 18v-4.5H8.5" />
    </>
  ));
}

export function IconInbox({ size = 16, className }: Props) {
  return base(size, className, (
    <>
      <path d="M4 8l8-4 8 4v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" />
      <path d="M4 11h4.5l1.5 2h4l1.5-2H20" />
    </>
  ));
}

export function IconAlert({ size = 16, className }: Props) {
  return base(size, className, (
    <>
      <path d="M12 4l9 16H3L12 4z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ));
}

export function IconCheck({ size = 16, className }: Props) {
  return base(size, className, <path d="M5 13l4 4L19 7" />);
}

export function IconSpinner({ size = 16, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className || "spin-ico"} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function IconCamera({ size = 16, className }: Props) {
  return base(size, className, (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="14" r="3.5" />
    </>
  ));
}

export function IconUpload({ size = 16, className }: Props) {
  return base(size, className, (
    <>
      <path d="M12 16V5M8 9l4-4 4 4" />
      <path d="M5 19h14" />
    </>
  ));
}

export function IconCopy({ size = 16, className }: Props) {
  return base(size, className, (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </>
  ));
}

export function IconLink({ size = 16, className }: Props) {
  return base(size, className, (
    <>
      <path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93" />
      <path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.4a5 5 0 0 0 7.07 7.07L14 18.07" />
    </>
  ));
}

export function IconTag({ size = 16, className }: Props) {
  return base(size, className, (
    <>
      <path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-8.5 8.5L3 12z" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
    </>
  ));
}

export function IconCash({ size = 16, className }: Props) {
  return base(size, className, (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ));
}

export function IconFilter({ size = 16, className }: Props) {
  return base(size, className, <path d="M4 5h16l-6 7.5V19l-4 2v-8.5L4 5z" />);
}

export function IconDownload({ size = 16, className }: Props) {
  return base(size, className, (
    <>
      <path d="M12 4v11M8 11l4 4 4-4" />
      <path d="M5 19h14" />
    </>
  ));
}

export function IconList({ size = 16, className }: Props) {
  return base(size, className, (
    <>
      <path d="M8 7h12M8 12h12M8 17h12" />
      <path d="M4 7h.01M4 12h.01M4 17h.01" />
    </>
  ));
}

export function IconBell({ size = 16, className }: Props) {
  return base(size, className, (
    <>
      <path d="M18 9A6 6 0 0 0 6 9c0 7-3 8-3 8h18s-3-1-3-8" />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" />
    </>
  ));
}

export function IconPhone({ size = 16, className }: Props) {
  return base(size, className, (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18h2" />
    </>
  ));
}

export function IconQr({ size = 16, className }: Props) {
  return base(size, className, (
    <>
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
      <path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" />
    </>
  ));
}
