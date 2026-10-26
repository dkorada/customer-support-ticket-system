import { useId } from 'react';

export function Logo({ dark = false }: { dark?: boolean }) {
  // Unique per instance: a gradient defined inside a hidden copy of the logo would not render.
  const gradientId = useId();
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#818cf8" />
            <stop offset="1" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill={`url(#${gradientId})`} />
        <path d="M16 7a6 6 0 0 0-6 6v4l-2 3h16l-2-3v-4a6 6 0 0 0-6-6Zm-2.5 15a2.5 2.5 0 0 0 5 0Z" fill="#fff" />
      </svg>
      <div className="leading-tight">
        <div className={dark ? 'text-[15px] font-semibold text-white' : 'text-[15px] font-semibold text-slate-900'}>Beacon</div>
        <div className={dark ? 'text-[11px] text-indigo-200/70' : 'text-[11px] text-slate-500'}>Support Desk</div>
      </div>
    </div>
  );
}
