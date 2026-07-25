/** Clases Tailwind reutilizables (solo utilidades, sin CSS custom). */

export const tw = {
  glass:
    'border border-slate-200/80 bg-white/80 shadow-sm backdrop-blur-xl',
  panel:
    'rounded-3xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-xl sm:p-5',
  btn:
    'inline-flex items-center justify-center gap-2 rounded-full border border-transparent px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
  btnPrimary:
    'inline-flex items-center justify-center gap-2 rounded-full border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50',
  btnGhost:
    'inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/70 px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50',
  btnDanger:
    'inline-flex items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50',
  btnSm: 'px-3 py-1.5 text-xs',
  navLink:
    'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900',
  navLinkActive: 'bg-blue-50 font-medium text-blue-700 hover:bg-blue-50 hover:text-blue-700',
  input:
    'w-full rounded-2xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
  label:
    'mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500',
  formGrid: 'grid grid-cols-1 gap-4 sm:grid-cols-2',
  formGroup: 'flex flex-col',
  formGroupFull: 'flex flex-col sm:col-span-2',
  formActions: 'mt-4 flex flex-wrap justify-end gap-2',
  checkbox:
    'flex cursor-pointer items-center gap-2 text-sm font-normal normal-case tracking-normal text-slate-600',
  empty:
    'flex flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200/80 bg-white/80 p-8 text-center text-slate-600 shadow-sm backdrop-blur-xl',
  loader:
    'flex min-h-48 flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200/80 bg-white/80 px-6 py-14 text-slate-600 shadow-sm backdrop-blur-xl',
  loaderCompact:
    'flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-8 text-sm text-slate-600 shadow-sm backdrop-blur-xl',
  toast:
    'pointer-events-auto flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-3 text-sm text-slate-800 shadow-lg backdrop-blur-xl',
  modalOverlay:
    'fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4',
  modal:
    'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-slate-200/80 bg-white/95 shadow-xl backdrop-blur-xl sm:max-w-xl sm:rounded-3xl',
  table:
    'w-full border-collapse text-left text-sm',
  th:
    'border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500',
  td:
    'border-b border-slate-100 px-3 py-2.5 align-middle text-slate-600',
  badge:
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
  badgeMssql: 'bg-red-50 text-red-700',
  badgeMysql: 'bg-cyan-50 text-cyan-700',
  statusOnline: 'font-semibold text-green-600',
  statusOffline: 'font-semibold text-red-600',
  statusChecking: 'font-semibold text-amber-600',
  statusMuted: 'font-semibold text-slate-400',
  card:
    'flex flex-col gap-3 rounded-3xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-xl transition',
  cardGrid: 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3',
  cardRingOnline: 'ring-2 ring-green-400/50',
  cardRingOffline: 'ring-2 ring-red-400/50',
  cardRingChecking: 'ring-2 ring-amber-400/50',
  hostingBanner:
    'mb-4 flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-sm backdrop-blur-xl',
  hostingBannerWarn:
    'mb-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900 shadow-sm backdrop-blur-xl',
  tablePanel:
    'overflow-x-auto rounded-3xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-xl sm:p-5',
  tableToolbar: 'mb-4 flex flex-wrap items-center gap-3',
  tableEmpty: 'px-3 py-8 text-center text-sm text-slate-500',
  tableActions: 'flex flex-wrap items-center gap-1.5 whitespace-nowrap',
  tableTag:
    'inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700',
  tableTagOk:
    'inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700',
  tableTagMuted:
    'inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500',
  queryPreview: 'block max-w-md truncate font-mono text-xs text-slate-600',
  sqlResult:
    'mt-4 max-h-80 overflow-auto rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs text-slate-100',
  code: 'rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700',
};

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}
