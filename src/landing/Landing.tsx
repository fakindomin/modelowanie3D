import { useEffect, useMemo, useRef, useState } from 'react';
import { PROJECT_ITEMS, USE_CATS, type ProjectItem, type UseCat } from '../projects';
import { WIZARD_GROUPS, WIZARDS } from '../wizards';
import { Icon } from '../ui/Icon';
import { CatIcon, MenuIcon, ReadyIcon, StateIcon, WizardIcon } from '../ui/KindIcons';
import { mountDemo } from './demo';
import { thumb, thumbNow, type ThumbKey } from './thumbs';
import { ITEM_TAGS, WIZARD_TAGS, matches } from '../searchTags';
import './landing.css';

/** What the start page asks the app to do when the visitor leaves it for the editor. */
export type StartAction = { kind: 'app' } | { kind: 'item'; item: ProjectItem } | { kind: 'wizard'; id: string };

/** Views of the start page, each its own plain #name in the address (the editor is #edytor). */
export const LANDING_VIEWS = ['start', 'projekty', 'kreatory', 'jak', 'sklep', 'faq'] as const;
type View = (typeof LANDING_VIEWS)[number];
const MENU: [View, string][] = [
  ['start', 'Start'],
  ['projekty', 'Gotowe projekty'],
  ['kreatory', 'Kreatory'],
  ['jak', 'Jak to działa'],
  ['sklep', 'Zamów wydruk'],
  ['faq', 'Pytania'],
];
const THEME_KEY = 'modelowanie3d.theme';
const CAT_KEY = 'modelowanie3d.startCat';

const viewFromHash = (): View => {
  const h = location.hash.slice(1);
  return (LANDING_VIEWS as readonly string[]).includes(h) ? (h as View) : 'start';
};
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};
const catLabel = (id: UseCat) => USE_CATS.find((c) => c.id === id)?.label ?? id;

export function Landing({ onOpen }: { onOpen: (a: StartAction) => void }) {
  const [view, setView] = useState<View>(viewFromHash);
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState<string | null>(() => {
    const t = read(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : null;
  });
  const sysDark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme ? theme === 'dark' : sysDark;

  useEffect(() => {
    const on = () => {
      setView(viewFromHash());
      setMenu(false);
      window.scrollTo(0, 0);
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => !(e.target as Element).closest?.('.nav') && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    addEventListener('pointerdown', close);
    addEventListener('keydown', esc);
    return () => {
      removeEventListener('pointerdown', close);
      removeEventListener('keydown', esc);
    };
  }, [menu]);

  const projects = PROJECT_ITEMS.filter((i) => i.kind !== 'figurines' && i.kind !== 'wizard');
  const wizardCount = Object.keys(WIZARDS).length;

  return (
    <div className="landing lpage" data-theme={theme ?? undefined}>
      <header className="nav">
        <div className="wrap">
          <a className="llogo" href="#start" aria-label="Modelowanie 3D, start">
            <span className="disc" aria-hidden>◆</span>
            <span>
              Modelowanie&nbsp;3D<i>.</i>
            </span>
          </a>
          <button className="menu-btn" type="button" aria-expanded={menu} aria-controls="lmenu" onClick={() => setMenu(!menu)}>
            Menu
          </button>
          <ul id="lmenu" className={menu ? 'open' : ''}>
            {MENU.map(([id, label]) => (
              <li key={id}>
                <a href={'#' + id} aria-current={view === id ? 'page' : undefined}>
                  {id === 'projekty' ? <ReadyIcon size={16} /> : id === 'kreatory' ? <WizardIcon size={16} /> : <MenuIcon id={id} size={16} />}
                  {label}
                </a>
              </li>
            ))}
            <li className="m-only">
              <a href="#edytor" style={{ color: 'var(--orange)' }} onClick={(e) => (e.preventDefault(), onOpen({ kind: 'app' }))}>
                Otwórz aplikację →
              </a>
            </li>
          </ul>
          <div className="bottom">
            <button className="btn primary btn-s nav-app" type="button" onClick={() => onOpen({ kind: 'app' })}>
              Otwórz aplikację →
            </button>
            <button
              type="button"
              className={dark ? 'theme-toggle is-dark' : 'theme-toggle'}
              aria-label={dark ? 'Przełącz na tryb jasny' : 'Przełącz na tryb ciemny'}
              onClick={() => {
                const t = dark ? 'light' : 'dark';
                setTheme(t);
                write(THEME_KEY, t);
              }}
            >
              <svg className="i-moon" viewBox="0 0 24 24" aria-hidden>
                <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z" />
              </svg>
              <svg className="i-sun" viewBox="0 0 24 24" aria-hidden>
                <circle cx="12" cy="12" r="4.2" />
                <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
              </svg>
              <span className="theme-label">{dark ? 'Tryb jasny' : 'Tryb ciemny'}</span>
            </button>
          </div>
        </div>
      </header>

      <main>
        {view === 'start' && <Start projects={projects.length} wizards={wizardCount} />}
        {view === 'projekty' && <Projects items={projects} onOpen={onOpen} />}
        {view === 'kreatory' && <Wizards onOpen={onOpen} />}
        {view === 'jak' && <How />}
        {view === 'sklep' && <Shop />}
        {view === 'faq' && <Faq />}
      </main>

      <footer className="site-foot">
        <div className="wrap">
          <span>Modelowanie 3D</span>
          <nav aria-label="Stopka">
            <a href="https://sezonowe3d.pl" target="_blank" rel="noopener">
              sezonowe3d.pl
            </a>
            <a href="#faq">Pytania</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Start({ projects, wizards }: { projects: number; wizards: number }) {
  const cfg = useRef<HTMLDivElement>(null);
  useEffect(() => (cfg.current ? mountDemo(cfg.current) : undefined), []);
  return (
    <section className="hero">
      <div className="wrap">
        <span className="tape">Przedmioty do druku 3D na wymiar</span>
        <h1>
          Wybierz gotowy przedmiot, <em>ustaw wymiary</em> i drukuj.
        </h1>
        <p className="lede">
          <strong>Nic nie projektujesz od zera.</strong> Bierzesz gotowy projekt albo odpowiadasz na pytania kreatora, a potem przesuwasz suwaki i wybierasz opcje.
        </p>
        <a className="btn primary start-go" href="#projekty">
          Zaczynamy →
        </a>

        <div className="cfg" ref={cfg} role="img" aria-label="Pokaz: zmiana wymiarów i opcji pudełka z pokrywką" inert>
          <div className="cfg-head">
            <span className="crumbs">
              Projekty › Dom › <b>Pudełko z pokrywką</b>
            </span>
            <span className="play">▶ pokaz</span>
          </div>
          <div className="cfg-body">
            <div className="view">
              <span className="caption">Chwyć wymiar i przeciągnij</span>
              <svg className="iso" viewBox="0 0 400 320" aria-hidden />
              <span className="fit ok"><StateIcon id="ok" /> mieści się na stole 256 mm</span>
            </div>
            <div className="ctrls">
              <h4>Wymiary</h4>
              {(
                [
                  ['W', 'Szerokość', 40, 240, 120],
                  ['D', 'Głębokość', 40, 200, 80],
                  ['H', 'Wysokość', 20, 150, 60],
                ] as const
              ).map(([k, label, min, max, v]) => (
                <div className="sl" key={k}>
                  <label>{label}</label>
                  <output data-k={k}>{v} mm</output>
                  <input data-k={k} type="range" min={min} max={max} step={5} defaultValue={v} tabIndex={-1} aria-label={label} />
                </div>
              ))}
              <h4>Pokrywka</h4>
              <div className="seg seg-lid">
                <button type="button" data-v="press" aria-pressed="true">Wciskana</button>
                <button type="button" data-v="hinge" aria-pressed="false">Na zawiasie</button>
                <button type="button" data-v="magnet" aria-pressed="false">Na magnesy</button>
              </div>
              <h4>Dodatki</h4>
              <div className="seg seg-add">
                <button type="button" data-v="text" aria-pressed="true">Napis</button>
                <button type="button" data-v="tex" aria-pressed="false">Faktura</button>
              </div>
            </div>
          </div>
          <div className="cfg-foot">
            <span className="parts">2 części do druku</span>
            <span className="btn primary">Pobierz STL / 3MF</span>
          </div>
          <div className="cursor" aria-hidden hidden>
            <span className="ring" />
            <svg viewBox="0 0 26 26" width="26" height="26">
              <path d="M3 2 L3 21 L8 16 L12 24 L15 22.5 L11 15 L18 15 Z" fill="#fff" stroke="#111" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        <div className="doors">
          <a className="door" href="#projekty">
            <span className="lnum">{projects}</span>
            <b>Gotowych projektów</b>
            <small>W {USE_CATS.length} miejscach: kuchnia, warsztat, biurko, ogród i inne.</small>
            <span className="go">Zobacz projekty →</span>
          </a>
          <a className="door" href="#kreatory">
            <span className="lnum">{wizards}</span>
            <b>Kreatorów</b>
            <small>Kilka pytań, np. o wymiary szuflady, i model składa się sam.</small>
            <span className="go">Zobacz kreatory →</span>
          </a>
        </div>
      </div>
    </section>
  );
}

function Projects({ items, onOpen }: { items: ProjectItem[]; onOpen: (a: StartAction) => void }) {
  const [cat, setCat] = useState<string>(() => read(CAT_KEY) ?? 'all');
  const pick = (c: string) => {
    setCat(c);
    write(CAT_KEY, c);
  };
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    if (q.trim()) return items.filter((i) => matches(q, [i.label, i.desc, ITEM_TAGS[i.label] ?? '', ...i.tags.map(catLabel)].join(' ')));
    return cat === 'all' ? items.slice(0, 12) : items.filter((i) => i.tags.includes(cat as UseCat));
  }, [cat, items, q]);
  return (
    <section className="view-page wrap">
      <div className="sec-head">
        <span className="mono"><ReadyIcon size={16} />Gotowe projekty</span>
        <h2>Wybierz według miejsca, w którym go użyjesz</h2>
        <p className="lead">Każdy projekt otwiera się w aplikacji z wymiarami do zmiany.</p>
      </div>
      <SearchBox value={q} onChange={setQ} placeholder="Szukaj: np. haczyk, kable, doniczka, pies…" count={q.trim() ? list.length : null} />
      <div className="lchips" role="toolbar" aria-label="Miejsce użycia">
        <button className="lchip" type="button" aria-pressed={!q.trim() && cat === 'all'} onClick={() => { setQ(''); pick('all'); }}>
          Polecane
        </button>
        {USE_CATS.map((c) => (
          <button key={c.id} className="lchip" type="button" aria-pressed={!q.trim() && cat === c.id} onClick={() => { setQ(''); pick(c.id); }}>
            <CatIcon id={c.id} size={16} />
            {c.label}
            <span className="n">{items.filter((i) => i.tags.includes(c.id)).length}</span>
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="noresult">Nic nie pasuje do „{q.trim()}”. Spróbuj innego słowa albo zajrzyj do kreatorów.</p>}
      <div className="grid">
        {list.map((i) => (
          <Tile key={i.label} k={{ item: i }} icon={i.icon} label={i.label} kind="p" sub={i.tags.map(catLabel).join(' · ')} onClick={() => onOpen({ kind: 'item', item: i })} />
        ))}
      </div>
      <div className="more-row">
        <button className="btn ghost" type="button" onClick={() => onOpen({ kind: 'app' })}>
          Wszystkie projekty i Figurki w aplikacji →
        </button>
      </div>
    </section>
  );
}

const WIZ_ICON: Record<string, string> = Object.fromEntries(
  PROJECT_ITEMS.flatMap((i) => (i.kind === 'wizard' ? [[i.wizard, i.icon]] : [])),
);

/** Badge marks (icon only; the words live in the menu): stage arrows for a wizard, a finished pot on the bed for a ready project. */
function KindBadge({ kind }: { kind: 'p' | 'w' }) {
  return (
    <span className={'badge ' + kind} title={kind === 'w' ? 'Kreator' : 'Gotowy projekt'} aria-label={kind === 'w' ? 'Kreator' : 'Gotowy projekt'} role="img">
      {kind === 'w' ? <WizardIcon /> : <ReadyIcon />}
    </span>
  );
}

/** One tile: the model's picture (its icon until the picture is ready), the badge, the name and where it fits. */
function Tile({ k, icon, label, kind, sub, onClick }: { k: ThumbKey; icon: string; label: string; kind: 'p' | 'w'; sub: string; onClick: () => void }) {
  const [src, setSrc] = useState<string | null>(() => thumbNow(k));
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (src) return;
    let live = true;
    void thumb(k).then((u) => {
      if (!live) return;
      setFresh(true);
      setSrc(u);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label]);
  return (
    <button type="button" className={'lcard ' + kind} onClick={onClick}>
      <span className="thumb">
        {src ? <img src={src} alt="" className={fresh ? 'fresh' : undefined} /> : <Icon type={icon} hole={false} />}
        <KindBadge kind={kind} />
      </span>
      <h3>{label}</h3>
      <span className="cats">{sub}</span>
    </button>
  );
}

/** Search field above the tiles; shows how many match while something is typed. */
function SearchBox({ value, onChange, placeholder, count }: { value: string; onChange: (v: string) => void; placeholder: string; count: number | null }) {
  return (
    <div className="lsearch" role="search">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
        <path d="M10 3h4l4 4v4l-4 4h-4l-4-4V7z" />
        <path d="M16 15l5 5" />
      </svg>
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label="Szukaj" />
      {count !== null && <span className="n">{count} {count === 1 ? 'wynik' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'wyniki' : 'wyników'}</span>}
      {value && (
        <button type="button" className="clear" onClick={() => onChange('')} aria-label="Wyczyść">
          ×
        </button>
      )}
    </div>
  );
}

function Wizards({ onOpen }: { onOpen: (a: StartAction) => void }) {
  const all = WIZARD_GROUPS.flatMap((g) => g.items.map((w) => ({ ...w, group: g.label })));
  const ready = all.filter((w) => w.ready);
  const soon = all.filter((w) => !w.ready);
  const [q, setQ] = useState('');
  const shown = q.trim() ? ready.filter((w) => matches(q, [w.label, w.desc, w.group, WIZARD_TAGS[w.id] ?? ''].join(' '))) : ready;
  return (
    <section className="view-page wrap">
      <div className="sec-head">
        <span className="mono"><WizardIcon size={16} />Kreatory</span>
        <h2>Nie wiesz, od czego zacząć? Odpowiedz na kilka pytań</h2>
        <p className="lead">Kreator pyta o wymiary i sposób użycia, składa model, a potem możesz go dalej zmieniać jak każdy gotowy projekt.</p>
      </div>
      <SearchBox value={q} onChange={setQ} placeholder="Szukaj: np. szuflada, rama, raspberry, podlewanie…" count={q.trim() ? shown.length : null} />
      {shown.length === 0 && <p className="noresult">Żaden kreator nie pasuje do „{q.trim()}”. Spróbuj innego słowa albo zajrzyj do gotowych projektów.</p>}
      <div className="grid">
        {shown.map((w) => (
          <Tile key={w.id} k={{ wizard: w.id }} icon={WIZ_ICON[w.id] ?? 'box'} label={w.label} kind="w" sub={w.group} onClick={() => onOpen({ kind: 'wizard', id: w.id })} />
        ))}
      </div>
      {soon.length > 0 && <p className="soon">Wkrótce: {soon.map((w) => w.label.toLowerCase()).join(', ')}.</p>}
    </section>
  );
}

function How() {
  return (
    <section className="view-page wrap">
      <div className="sec-head">
        <span className="mono">Jak to działa</span>
        <h2>Trzy kroki, żadnego rysowania</h2>
      </div>
      <div className="two">
        <ol className="how">
          <li>
            <span className="mono">Krok 1</span>
            <span>
              <b>Wybierz projekt albo kreator</b>
              <span className="d">Szukasz według miejsca, w którym przedmiot będzie stał, albo odpowiadasz na kilka pytań kreatora.</span>
            </span>
          </li>
          <li>
            <span className="mono">Krok 2</span>
            <span>
              <b>Zmień wymiary i opcje</b>
              <span className="d">Pole z liczbą i suwak przy każdym wymiarze. Na komputerze możesz też chwycić wymiar na podglądzie.</span>
            </span>
          </li>
          <li>
            <span className="mono">Krok 3</span>
            <span>
              <b>Pobierz plik do druku</b>
              <span className="d">STL albo 3MF z częściami ułożonymi płasko na stole i listą rzeczy do dokupienia.</span>
            </span>
          </li>
        </ol>
        <div>
          <h4>Co możesz zmienić</h4>
          <ul className="feats">
            <li>Wymiary: pokrywka, przegródki i otwory dopasowują się same</li>
            <li>Zamknięcie: wciskane, wsuwane, na zawiasie, na magnesy albo zakręcane</li>
            <li>Magnesy, otwory na wkręty, uszy do ściany</li>
            <li>Napis, faktura na wybranej ściance i kolor każdej części</li>
          </ul>
          <h4 style={{ marginTop: 28 }}>Co aplikacja robi sama</h4>
          <ul className="feats">
            <li>Dobiera luzy, żeby części do siebie pasowały</li>
            <li>Sprawdza, czy model mieści się na stole i nie ma za cienkich ścianek</li>
            <li>Pisze instrukcję: co wydrukować, co kupić i co do czego pasuje</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function Shop() {
  return (
    <section className="view-page wrap">
      <div className="sec-head">
        <span className="mono">Nie masz drukarki?</span>
        <h2>Zamów gotowy wydruk na sezonowe3d.pl</h2>
      </div>
      <div className="shop">
        <div className="copy">
          <p>W zakładce „Na wymiar” wpisujesz wymiary tak samo jak tutaj, a wydruk przychodzi pocztą.</p>
          <a className="btn primary" href="https://sezonowe3d.pl" target="_blank" rel="noopener">
            Otwórz sezonowe3d.pl ↗
          </a>
        </div>
        <ol className="how">
          <li>
            <span className="mono">1</span>
            <span>
              <b>Wybierasz model</b>
            </span>
          </li>
          <li>
            <span className="mono">2</span>
            <span>
              <b>Wpisujesz wymiary</b>
            </span>
          </li>
          <li>
            <span className="mono">3</span>
            <span>
              <b>Zamawiasz wydruk albo kupujesz plik STL</b>
            </span>
          </li>
        </ol>
      </div>
    </section>
  );
}

const FAQ: [string, string][] = [
  ['Czy mogę zaprojektować coś od zera?', 'Nie. Aplikacja jest do zmieniania gotowych projektów i kreatorów. Dzięki temu każdy model da się wydrukować bez poprawek.'],
  ['Z jaką drukarką to działa?', 'Z każdą drukarką FDM, która czyta STL albo 3MF. Drukarkę wybierasz raz na górnym pasku, a wymiary zatrzymują się na granicy jej stołu.'],
  ['STL czy 3MF?', 'STL to jeden plik na część, spakowany w zip. 3MF trzyma wszystkie części ułożone na stołach, osobno dla każdego materiału.'],
  ['Czy części będą do siebie pasować?', 'Tak, bo luz jest częścią projektu. Jeśli Twoja drukarka drukuje ciaśniej, wydrukuj próbkę luzu z Projektów › Drukarka 3D.'],
  ['Skąd wiem, co dokupić?', 'Instrukcja wypisuje magnesy, śruby, o-ringi i elektronikę z wymiarami, razem z listą części do druku.'],
  ['Czy zadziała na telefonie?', 'Tak. Na telefonie zmieniasz wymiary suwakami, na komputerze możesz też chwytać wymiary na podglądzie.'],
];

function Faq() {
  return (
    <section className="view-page wrap">
      <div className="sec-head">
        <span className="mono">Pytania</span>
        <h2>Drukarki, pliki i wymiary</h2>
      </div>
      <div className="faq">
        {FAQ.map(([q, a], i) => (
          <details key={q} open={i === 0}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
