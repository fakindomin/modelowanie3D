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
