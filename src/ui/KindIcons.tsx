/**
 * Icons shared across the app, all in one style (taken from the question mark): straight strokes with
 * cut corners, no curves, line width 2 on a 24-unit grid, and at most one small solid element.
 * Drawn in currentColor so they follow the text colour of the button, badge or tab.
 */
type P = { size?: number; className?: string; title?: string };

const base = (size: number, className?: string) => ({
  viewBox: '0 0 24 24',
  width: size,
  height: size,
  className: 'kicon' + (className ? ' ' + className : ''),
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinejoin: 'miter' as const,
  strokeLinecap: 'butt' as const,
  strokeMiterlimit: 4,
});

const BED = 'M1.6 16.5 12 10.5 22.4 16.5 12 22.5z';
// Pot drawn like the question mark: straight cut corners, solid body, the opening cut out (transparent).
const POT = 'M5.5 7.5 8 5h8l2.5 2.5L16 16.5l-1.5 2h-5l-1.5-2zM7.6 7.5 9.1 6.3h5.8l1.5 1.2-1.5 1.2H9.1z';

/** Ready-made project: a full pot on the bed (outline only); the opening at the top is cut out. */
export function ReadyIcon({ size = 18, className, title }: P) {
  return (
    <svg {...base(size, className)} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={BED} />
      <path d={POT} fill="currentColor" fillRule="evenodd" stroke="none" />
    </svg>
  );
}

/** Wizard: a done step (small solid block) followed by two stage arrows. */
export function WizardIcon({ size = 18, className, title }: P) {
  return (
    <svg {...base(size, className)} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d="M2 9.75h4.5v4.5H2z" fill="currentColor" stroke="none" />
      <path d="M9 5l5 7-5 7M16 5l5 7-5 7" />
    </svg>
  );
}

/**
 * Start-page menu icons, drawn like the question mark: straight strokes with cut corners,
 * one line, and one small filled block the size of the question mark's dot.
 */
const MENU_ICONS = {
  start: { line: 'M3 11.5 12 4l9 7.5M5 10v11h14V10', block: 'M10.5 15.5h3V21h-3z' },
  jak: { line: 'M9 16v-2.5l-3-3V6l3-3h6l3 3v4.5l-3 3V16H9z', block: 'M10.5 18.5h3v3h-3z' },
  sklep: { line: 'M2 4h3l2.5 11h11L21 7H6', block: 'M7.5 18.5h3v3h-3zM15.5 18.5h3v3h-3z' },
  faq: { line: 'M7 8V5l2-2h6l2 2v4.5l-5 3.5v3', block: 'M10.5 18.5h3v3h-3z' },
} as const;
export type MenuIconId = keyof typeof MENU_ICONS;

export function MenuIcon({ id, size = 18, className }: { id: MenuIconId; size?: number; className?: string }) {
  const ic = MENU_ICONS[id];
  return (
    <svg {...base(size, className)} aria-hidden>
      <path d={ic.line} />
      <path d={ic.block} fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Editor toolbar icons, same style (cut corners, one line, at most one small solid element). */
const TOOL_ICONS: Record<string, { line: string; block?: string; mirror?: boolean }> = {
  undo: { line: 'M7 9h8l3 3v4l-3 3h-5', block: 'M8.5 4.5 3.5 9l5 4.5z' },
  redo: { line: 'M7 9h8l3 3v4l-3 3h-5', block: 'M8.5 4.5 3.5 9l5 4.5z', mirror: true },
  new: { line: 'M3 6l3-3h12l3 3v12l-3 3H6l-3-3zM12 7.5v9M7.5 12h9' },
  open: { line: 'M2 20V5h7l2 2h9v3M2 20l3-9h17l-3 9z' },
  save: { line: 'M3 3h14l4 4v14H3zM7 3v5h8V3', block: 'M8 14h8v4H8z' },
  printer: { line: 'M8 2h8v6l-4 4-4-4zM2 21h20', block: 'M10.5 16h3v5h-3z' },
  fit: { line: 'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5', block: 'M10.5 10.5h3v3h-3z' },
  layout: { line: 'M2 21h20M4 13h6v8M13 16h7v5M16.5 3v8M14 8.5l2.5 2.5L19 8.5' },
  measure: { line: 'M3 7v10M21 7v10M3 12h18', block: 'M6 9.5 3.5 12 6 14.5zM18 9.5l2.5 2.5-2.5 2.5z' },
  section: { line: 'M3 3h18v18H3zM12 1v22M12 8l5-5M12 14l9-9M12 20l9-9' },
  preview: { line: 'M2 12l5-6h10l5 6-5 6H7z', block: 'M10.5 10.5h3v3h-3z' },
  check: { line: 'M3 3h18v18H3zM7 12l3.5 3.5L17 9' },
  manual: { line: 'M2 5h7l3 2 3-2h7v14h-7l-3 2-3-2H2zM12 7v14' },
  export: { line: 'M12 3v10M7.5 8.5 12 13l4.5-4.5M3 15v6h18v-6', block: 'M10.5 17h3v2h-3z' },
};
export type ToolIconId = 'undo' | 'redo' | 'new' | 'open' | 'save' | 'printer' | 'fit' | 'layout' | 'measure' | 'section' | 'preview' | 'check' | 'manual' | 'export';

export function ToolIcon({ id, size = 16, className }: { id: ToolIconId; size?: number; className?: string }) {
  const ic = TOOL_ICONS[id];
  return (
    <svg {...base(size, className)} aria-hidden>
      <g transform={ic.mirror ? 'matrix(-1 0 0 1 24 0)' : undefined}>
        <path d={ic.line} />
        {ic.block && <path d={ic.block} fill="currentColor" stroke="none" />}
      </g>
    </svg>
  );
}

/** Use-place category icons (filters on the start page, category headers in the editor library). */
const CAT_ICONS: Record<string, { line: string; block?: string }> = {
  home: { line: 'M3 11 12 3l9 8v10H3zM16 6.5V3h3v6.2', block: 'M10.5 13h3v3h-3z' },
  kitchen: { line: 'M4 10h16v8l-2 2H6l-2-2zM2 10h20', block: 'M10.5 6h3v3h-3z' },
  bath: { line: 'M2 11h20v4l-3 4H5l-3-4zM5 11V5l2-2h3v2', block: 'M9 7h2v2H9z' },
  garden: { line: 'M12 14V8M12 11 7 8V4l5 3M12 9l5-3V3l-5 3', block: 'M6 14h12l-1.5 7h-9z' },
  workshop: { line: 'M9.4 11.5 11.5 9.4 17.7 15.6 15.6 17.7z', block: 'M2.4 10.9 8.1 5.2 12.3 3.1 13.3 4.1 11.2 8.3 5.5 14zM15.7 18.4 18.4 15.7 21.8 19.1 19.1 21.8z' },
  desk: { line: 'M2 8h20M4 8v13M20 8v13M12 8v7h8', block: 'M14.5 10.5h3v2h-3z' },
  electronics: { line: 'M6 6h12v12H6zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4', block: 'M10 10h4v4h-4z' },
  kids: { line: 'M12 3v3M5 11l3-5h8l3 5-7 11z', block: 'M10 1.5h4v2.5h-4z' },
  printer: { line: 'M12 2v5M8 7h8v5l-4 4-4-4zM3 21h18', block: 'M10.5 18h3v3h-3z' },
  pets: { line: 'M7 15l2.5-2.5h5L17 15v4l-2 2H9l-2-2z', block: 'M3 9h3v3H3zM8 4.5h3v3H8zM13 4.5h3v3h-3zM18 9h3v3h-3z' },
  vehicle: { line: 'M2 15l2-2h2l2 2v2l-2 2H4l-2-2zM16 15l2-2h2l2 2v2l-2 2h-2l-2-2zM5 16l4-7h7l3 7M9 9l3 7M8 6h3', block: 'M10.5 14.5h3v3h-3z' },
};

export function CatIcon({ id, size = 18, className }: { id: string; size?: number; className?: string }) {
  const ic = CAT_ICONS[id];
  if (!ic) return null;
  return (
    <svg {...base(size, className)} aria-hidden>
      {ic.line && <path d={ic.line} />}
      {ic.block && <path d={ic.block} fill="currentColor" stroke="none" />}
    </svg>
  );
}

/** Option icons in the dimensions panel (dividers, magnets, lattice, texture, text, print, colour, lock…). */
const OPT_ICONS = {
  div: { line: 'M3 3h18v18H3zM12 3v18M3 12h9', block: 'M14.5 14.5h4v4h-4z' },
  mag: { line: 'M5 6v7l3 4h8l3-4V6M9 6v6l1 1h4l1-1V6', block: 'M4 2h6v4H4zM14 2h6v4h-6z' },
  infill: { line: 'M3 3h18v18H3zM3 12l9-9 9 9-9 9z' },
  tex: { line: 'M2 8l3-3 3 3 3-3 3 3 3-3 3 3M2 16l3-3 3 3 3-3 3 3 3-3 3 3' },
  text: { line: 'M4 7V3h16v4M12 3v16', block: 'M8.5 19h7v3h-7z' },
  print: { line: 'M4 2h8v5l-4 4-4-4zM2 21h20M13 16l2.5 2.5L21 13' },
  color: { line: 'M12 2l6 8v6l-3 4H9l-3-4v-6z', block: 'M6 13h12v3l-3 4H9l-3-4z' },
  lock: { line: 'M5 11h14v10H5zM8 11V6l2-2h4l2 2v5', block: 'M10.5 14h3v4h-3z' },
  wiz: { line: 'M6 20 18 8l-2-2L4 18M16 6l2-2 2 2-2 2', block: 'M2.5 21.5 4 18l2 2z' },
  ends: { line: 'M3 7v10M21 7v10M3 12h18', block: 'M7 9.5 4.5 12 7 14.5zM17 9.5l2.5 2.5-2.5 2.5z' },
  link: { line: 'M2 12l3-4h6l3 4-3 4H5zM10 12l3-4h6l3 4-3 4h-6z' },
  unlock: { line: 'M5 11h14v10H5zM8 11V6l2-2h4l2 2v1', block: 'M10.5 14h3v4h-3z' },
  unlink: { line: 'M1.5 12 4 8.5h4l2.5 3.5L8 15.5H4zM13.5 12 16 8.5h4l2.5 3.5-2.5 3.5h-4z' },
  manual: { line: 'M2 5h7l3 2 3-2h7v14h-7l-3 2-3-2H2zM12 7v14' },
  wrap: { line: 'M6 3h12v18H6z', block: 'M6 10h12v4H6z' },
  redo: { line: 'M20 13v3l-4 4H8l-4-4V8l4-4h8l3 3', block: 'M14.5 8.5H21V2z' },
  goto: { line: 'M2 12h11M8 7l5 5-5 5', block: 'M16 6.5h5v11h-5z' },
  merge: { line: 'M3 3h12v12H3zM9 9h12v12H9z' },
  fit: { line: 'M1 12h6M4 9l3 3-3 3M23 12h-6M20 9l-3 3 3 3', block: 'M10.5 10.5h3v3h-3z' },
  copies: { line: 'M10 2h12v12M6 6h12v12', block: 'M2 10h12v12H2z' },
  texedit: { line: 'M2 21l3-3 3 3 3-3 3 3 3-3 3 3M9 13 18 4l2 2-9 9', block: 'M7 17l2-4 2 2z' },
  face: { line: 'M12 2l9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10', block: 'M12 12l9-5v10l-9 5z' },
  printdoc: { line: 'M6 9V2h12v7M6 18H2V9h20v9h-4M6 14h12v8H6z', block: 'M16 11h3v2h-3z' },
} as const;
export type OptIconId = keyof typeof OPT_ICONS;

export function OptIcon({ id, size = 16, className }: { id: OptIconId; size?: number; className?: string }) {
  const ic: { line: string; block?: string } = OPT_ICONS[id];
  return (
    <svg {...base(size, className)} aria-hidden>
      <path d={ic.line} />
      {ic.block && <path d={ic.block} fill="currentColor" stroke="none" />}
    </svg>
  );
}

/** State icons and small UI symbols (ok, warning, close, menu, expand, info, back, settings). */
const STATE_ICONS = {
  ok: { line: 'M8 2h8l6 6v8l-6 6H8l-6-6V8zM7 12l3.5 3.5L17 9' },
  warn: { line: 'M8 2h8l6 6v8l-6 6H8l-6-6V8zM12 6.5v7.5', block: 'M10.5 15.5h3v2.5h-3z' },
  close: { line: 'M3 3h18v18H3zM8 8l8 8M16 8l-8 8' },
  more: { line: 'M3 6h18M3 12h18M3 18h18' },
  expand: { block: 'M6 9h12l-6 7z' },
  info: { line: 'M9 10h3v10M8 20h8', block: 'M10.5 3.5h3v3h-3z' },
  back: { line: 'M20 12H5M11 6l-6 6 6 6' },
  list: { line: 'M9 5h12M9 12h12M9 19h12', block: 'M3 3.5h3v3H3z' },
  settings: { line: 'M18.3 10.6 21.4 10.5 21.4 13.5 18.3 13.4 17.5 15.5 19.7 17.6 17.6 19.7 15.5 17.5 13.4 18.3 13.5 21.4 10.5 21.4 10.6 18.3 8.5 17.5 6.4 19.7 4.3 17.6 6.5 15.5 5.7 13.4 2.6 13.5 2.6 10.5 5.7 10.6 6.5 8.5 4.3 6.4 6.4 4.3 8.5 6.5 10.6 5.7 10.5 2.6 13.5 2.6 13.4 5.7 15.5 6.5 17.6 4.3 19.7 6.4 17.5 8.5z', block: 'M10 10h4v4h-4z' },
} as const;
export type StateIconId = keyof typeof STATE_ICONS;

export function StateIcon({ id, size = 14, className }: { id: StateIconId; size?: number; className?: string }) {
  const ic: { line?: string; block?: string } = STATE_ICONS[id];
  return (
    <svg {...base(size, className ? 'sicon ' + className : 'sicon')} aria-hidden>
      {ic.line && <path d={ic.line} />}
      {ic.block && <path d={ic.block} fill="currentColor" stroke="none" />}
    </svg>
  );
}

/** Brand mark (same as the browser-tab icon): olive square, orange nozzle laying an L-shaped filament line on a layer. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={'logomark' + (className ? ' ' + className : '')} aria-hidden>
      <rect width="24" height="24" fill="#4b5320" />
      <path fill="#f26419" d="M7 2h10v5l-5 5-5-5z" />
      <path d="M12 11v5.2H21M3 21h18" fill="none" stroke="#e4e5df" strokeWidth={2.6} strokeLinejoin="miter" />
    </svg>
  );
}
