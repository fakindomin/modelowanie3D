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
