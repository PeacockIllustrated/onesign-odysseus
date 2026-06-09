// Shared visual language for the Site Surveys module — matches the visualiser /
// design-studio / backshop look (teal accent on light panels) rather than the
// default portal-admin chrome. See app/(portal)/admin/visualiser/* for the
// source of these patterns.

export const ACCENT = '#4e7e8c';
export const ACCENT_DARK = '#3a5f6a';
export const ACCENT_LIGHT = '#e8f0f3';

/** Standard panel/card surface. */
export const panelCls =
    'rounded-lg border border-neutral-200 bg-white shadow-sm';

/** Small uppercase section title, as used across the visualiser controls. */
export const sectionTitleCls =
    'text-[10px] font-semibold uppercase tracking-widest text-neutral-500';

/** Field label. */
export const labelCls = 'text-[11px] font-medium text-neutral-600';

/** Text/number/select input. Teal focus to carry the accent. */
export const inputCls =
    'w-full rounded-md border border-neutral-300 px-2.5 py-2 text-sm transition-colors focus:border-[#4e7e8c] focus:outline-none focus:ring-2 focus:ring-[#e8f0f3]';

/** Primary call-to-action (teal). */
export const primaryBtnCls =
    'inline-flex items-center justify-center gap-2 rounded-md bg-[#4e7e8c] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3a5f6a] disabled:cursor-not-allowed disabled:opacity-50';

/** Secondary button — neutral with a teal hover tint. */
export const secondaryBtnCls =
    'inline-flex items-center justify-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-[#4e7e8c] hover:bg-[#e8f0f3] hover:text-[#3a5f6a]';

/** Native checkbox tinted to the accent. */
export const checkboxCls = 'h-4 w-4 rounded border-neutral-300 accent-[#4e7e8c]';
