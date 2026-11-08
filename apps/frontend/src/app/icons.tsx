import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function ChatIcon() {
  return (
    <Icon>
      <path d="M2.5 4.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7.2L4.5 13.5v-2a2 2 0 0 1-2-2z" />
    </Icon>
  );
}

export function PlusIcon() {
  return (
    <Icon>
      <path d="M8 3.5v9M3.5 8h9" />
    </Icon>
  );
}

export function CloseIcon() {
  return (
    <Icon>
      <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
    </Icon>
  );
}

export function PencilIcon() {
  return (
    <Icon>
      <path d="M10.6 3.4a1.6 1.6 0 0 1 2.3 2.3L5.8 12.8 3 13.5l.7-2.8z" />
      <path d="m9.5 4.5 2.3 2.3" />
    </Icon>
  );
}

export function TrashIcon() {
  return (
    <Icon>
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
    </Icon>
  );
}

export function AgainIcon() {
  return (
    <Icon>
      <path d="M12.8 6.2A5 5 0 1 0 13 9" />
      <path d="M13 3v3.4H9.6" />
    </Icon>
  );
}

export function ChevronIcon() {
  return (
    <Icon>
      <path d="m6 4 4 4-4 4" />
    </Icon>
  );
}

export function UploadIcon() {
  return (
    <Icon>
      <path d="M8 10.5V3M4.5 6 8 2.5 11.5 6M3 13.5h10" />
    </Icon>
  );
}

export function SunIcon() {
  return (
    <Icon>
      <circle cx="8" cy="8" r="2.75" />
      <path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1" />
    </Icon>
  );
}

export function MoonIcon() {
  return (
    <Icon>
      <path d="M13.25 9.6A5.75 5.75 0 0 1 6.4 2.75a5.75 5.75 0 1 0 6.85 6.85z" />
    </Icon>
  );
}

/** Two nodes and the curve between them: the graph in its smallest form. */
export function LogoMark() {
  return (
    <svg className="logo" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M6 15c5 0 3-10 8-10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle className="logo-seed" cx="4.5" cy="15" r="2.75" />
      <circle cx="15.5" cy="5" r="2.75" fill="currentColor" />
    </svg>
  );
}
