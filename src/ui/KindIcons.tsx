/**
 * Icons shared across the app: "Gotowe projekty" (a finished flowerpot standing on the printer bed,
 * open only at the top) and "Kreator" (stage arrows, the first stage done). 24-unit grid, sharp corners,
 * line width 2, drawn in currentColor so they follow the text colour of the button, badge or tab.
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

const BED = 'M12 8.9 22.4 14.9 12 20.9 1.6 14.9z';
const POT = 'M16 14.9 16 15.2 15.9 15.5 15.7 15.8 15.5 16 15.2 16.3 14.9 16.5 14.5 16.7 14 16.9 13.6 17 13.1 17.1 12.5 17.2 12 17.2 11.5 17.2 10.9 17.1 10.4 17 10 16.9 9.5 16.7 9.1 16.5 8.8 16.3 8.5 16 8.3 15.8 8.1 15.5 8 15.2 8 14.9 6.4 6.4 6.4 6 6.6 5.5 6.8 5.1 7.1 4.8 7.5 4.4 8 4.1 8.6 3.8 9.2 3.6 9.8 3.4 10.5 3.2 11.3 3.1 12 3.1 12.7 3.1 13.5 3.2 14.2 3.4 14.8 3.6 15.4 3.8 16 4.1 16.5 4.4 16.9 4.8 17.2 5.1 17.4 5.5 17.6 6 17.6 6.4z';
const HOLE = 'M14.9 8 14.5 8.2 14 8.4 13.6 8.5 13.1 8.6 12.5 8.7 12 8.7 11.5 8.7 10.9 8.6 10.4 8.5 10 8.4 9.5 8.2 9.1 8 8.8 7.8 8.5 7.5 8.3 7.3 8.1 7 8 6.7 8 6.4 8 6.1 8.1 5.8 8.3 5.5 8.5 5.2 8.8 5 9.1 4.7 9.5 4.5 10 4.3 10.4 4.2 10.9 4.1 11.5 4.1 12 4 12.5 4.1 13.1 4.1 13.6 4.2 14 4.3 14.5 4.5 14.9 4.7 15.2 5 15.5 5.2 15.7 5.5 15.9 5.8 16 6.1 16 6.4 16 6.7 15.9 7 15.7 7.3 15.5 7.5 15.2 7.8 14.9 8z';

/** Ready-made project: a full pot on the bed; the hole at the top is cut out (transparent). */
export function ReadyIcon({ size = 18, className, title }: P) {
  return (
    <svg {...base(size, className)} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={BED} />
      <path d={POT + HOLE} fill="currentColor" fillRule="evenodd" stroke="none" />
      <path d={POT} />
    </svg>
  );
}

/** Wizard: three stage arrows, the first one done (filled). */
export function WizardIcon({ size = 18, className, title }: P) {
  return (
    <svg {...base(size, className)} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d="M2 5h4l5 7-5 7H2l5-7z" fill="currentColor" />
      <path d="M10 5l5 7-5 7M16 5l5 7-5 7" />
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
