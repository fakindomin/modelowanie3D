import { engineView, type ShowView } from './engineShow';

/**
 * The start page's show: a box with a lid whose width, depth and height change on their own while a
 * cursor drags the dimension on the model (computer) or the slider (phone), then flips the lid type
 * and the texture. It is only a show: the whole block is inert and ignores touches. The model is built by
 * the app's engine (engineShow.ts); the flat drawing below is only the first picture until the engine is ready
 * (and the fallback where WebGL is missing).
 */
const NS = 'http://www.w3.org/2000/svg';
const C = Math.cos(Math.PI / 6);
const S = 0.5;
const P = (x: number, y: number, z: number, s: number, ox: number, oy: number): [number, number] => [ox + (x - y) * C * s, oy + (x + y) * S * s - z * s];

function el(tag: string, attrs: Record<string, string | number>, parent?: Element): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(e);
  return e;
}

/** An axis-aligned block as its three visible faces; cls picks the colour set. */
export function drawBox(parent: Element, b: number[], s: number, ox: number, oy: number, cls = ''): SVGElement {
  const [x, y, z, w, d, h] = b;
  const p = (a: number, bb: number, c: number) => P(a, bb, c, s, ox, oy).map((v) => v.toFixed(1)).join(',');
  const g = el('g', { class: 'pc ' + cls }, parent);
  el('polygon', { class: 't', points: [p(x, y, z + h), p(x + w, y, z + h), p(x + w, y + d, z + h), p(x, y + d, z + h)].join(' ') }, g);
  el('polygon', { class: 'l', points: [p(x, y + d, z), p(x + w, y + d, z), p(x + w, y + d, z + h), p(x, y + d, z + h)].join(' ') }, g);
  el('polygon', { class: 'r', points: [p(x + w, y, z), p(x + w, y + d, z), p(x + w, y + d, z + h), p(x + w, y, z + h)].join(' ') }, g);
  return g;
}

type Key = 'W' | 'D' | 'H';
type State = { W: number; D: number; H: number; lid: string; text: boolean; tex: boolean; active: Key | null };
type Step = { k: Key; to: number } | { lid: string; say: string } | { add: 'tex' | 'text'; say: string };

const NAMES: Record<Key, string> = { W: 'szerokość', D: 'głębokość', H: 'wysokość' };
const SEQ: Step[] = [
  { k: 'W', to: 200 }, { k: 'D', to: 140 }, { k: 'H', to: 110 },
  { lid: 'magnet', say: 'Pokrywka na magnesy' }, { add: 'tex', say: 'Faktura na ściankach' },
  { k: 'H', to: 60 }, { k: 'W', to: 120 }, { k: 'D', to: 80 },
  { lid: 'press', say: 'Pokrywka wciskana' }, { add: 'tex', say: 'Bez faktury' },
];

/** Starts the show inside the given .cfg block; returns a function that stops it. */
export function mountDemo(cfg: HTMLElement, bed = 256): () => void {
  const $ = <T extends Element>(sel: string) => cfg.querySelector(sel) as T;
  const svg = $<SVGSVGElement>('.iso');
  const cur = $<HTMLElement>('.cursor');
  const cap = $<HTMLElement>('.caption');
  const st: State = { W: 120, D: 80, H: 60, lid: 'press', text: true, tex: false, active: null };
  let handles: Partial<Record<Key, [number, number]>> = {};

  let eng: ShowView | null = null;
  function draw() {
    if (eng) eng.draw(st);
    else drawFlat();
    const fit = $<HTMLElement>('.fit');
    const ok = Math.max(st.W, st.D, st.H + 8) <= bed;
    fit.className = 'fit ' + (ok ? 'ok' : 'bad');
    fit.textContent = ok ? `✓ mieści się na stole ${bed} mm` : 'za duże na stół';
  }
  function drawFlat() {
    svg.innerHTML = '';
    const { W, D, H } = st;
    const lidH = 8;
    const gap = st.lid === 'magnet' ? 16 : st.lid === 'hinge' ? 0 : 10;
    const tot = H + lidH + gap;
    const s = Math.min(360 / ((W + D) * C), 270 / ((W + D) * S + tot), 2.2);
    const O: [number, number] = [200 + ((D - W) * C * s) / 2 + 12, (320 - ((W + D) * S * s + tot * s)) / 2 + tot * s];
    drawBox(svg, [0, 0, 0, W, D, H], s, ...O);
    if (st.tex)
      for (let x = 8; x < W - 4; x += 8) {
        const a = P(x, D, 4, s, ...O), b = P(x, D, H - 4, s, ...O);
        el('line', { class: 'tex', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, svg);
      }
    if (st.text) {
      const c = P(W / 2, D, H / 2, s, ...O);
      const t = el('text', { class: 'lbl', 'text-anchor': 'middle', transform: `translate(${c[0]},${c[1]}) matrix(${C},${S},0,1,0,0)` }, svg);
      t.setAttribute('font-size', String(Math.max(9, Math.min(16, (W * s) / 9))));
      t.textContent = 'ŚRUBKI';
    }
    if (st.lid === 'magnet') for (const [x, y] of [[4, 4], [W - 12, 4], [4, D - 12], [W - 12, D - 12]]) drawBox(svg, [x, y, H, 8, 8, 1.5], s, ...O, 'g');
    if (st.lid === 'hinge') drawBox(svg, [0, -lidH, H, W, lidH, D * 0.9], s, ...O, 'd');
    else drawBox(svg, [-1, -1, H + gap, W + 2, D + 2, lidH], s, ...O, 'd');
    handles = {};
    const dim = (a: [number, number, number], b: [number, number, number], label: string, off: [number, number], k: Key) => {
      const p1 = P(...a, s, ...O), p2 = P(...b, s, ...O), on = st.active === k;
      el('path', { class: 'dim' + (on ? ' on' : ''), d: `M${p1[0] + off[0]},${p1[1] + off[1]}L${p2[0] + off[0]},${p2[1] + off[1]}` }, svg);
      const t = el('text', { class: 'dimtxt' + (on ? ' on' : ''), 'text-anchor': 'middle', x: (p1[0] + p2[0]) / 2 + off[0] * 2.4, y: (p1[1] + p2[1]) / 2 + off[1] * 2.4 + 4 }, svg);
      t.textContent = label;
      const hx = (p1[0] + p2[0]) / 2 + off[0], hy = (p1[1] + p2[1]) / 2 + off[1];
      handles[k] = [hx, hy];
      if (on) el('circle', { class: 'knob', cx: hx, cy: hy, r: 5 }, svg);
    };
    dim([0, D, 0], [W, D, 0], W + ' mm', [-8, 10], 'W');
    dim([W, 0, 0], [W, D, 0], D + ' mm', [12, 8], 'D');
    dim([0, D, 0], [0, D, H], H + ' mm', [-14, 0], 'H');
  }

  let run = 1;
  let pos: [number, number] = [0, 0];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const phone = () => matchMedia('(max-width:640px)').matches;
  const rel = (x: number, y: number): [number, number] => {
    const c = cfg.getBoundingClientRect();
    return [x - c.left, y - c.top];
  };
  const slider = (k: Key) => $<HTMLInputElement>(`input[data-k="${k}"]`);
  function handlePt(k: Key): [number, number] {
    if (phone()) {
      const i = slider(k), r = i.getBoundingClientRect();
      const f = (+i.value - +i.min) / (+i.max - +i.min);
      return rel(r.left + 8 + f * (r.width - 16), r.top + r.height / 2);
    }
    const e = eng?.handle(k);
    if (e) return rel(...e);
    const h = handles[k] ?? [0, 0], r = svg.getBoundingClientRect(), sc = r.width / 400;
    return rel(r.left + h[0] * sc, r.top + h[1] * sc);
  }
  const btnPt = (b: Element) => {
    const r = b.getBoundingClientRect();
    return rel(r.left + r.width * 0.55, r.top + r.height * 0.6);
  };
  const place = (p: [number, number]) => {
    pos = p;
    cur.style.transform = `translate(${p[0] - 3}px,${p[1] - 2}px)`;
  };
  async function moveTo(p: [number, number], ms: number, id: number) {
    const a = pos.slice() as [number, number], t0 = performance.now();
    for (;;) {
      if (id !== run) throw 0;
      const t = Math.min(1, (performance.now() - t0) / ms);
      place([a[0] + (p[0] - a[0]) * ease(t), a[1] + (p[1] - a[1]) * ease(t)]);
      if (t >= 1) break;
      await frame();
    }
  }
  function setVal(k: Key, v: number) {
    const i = slider(k);
    i.value = String(v);
    st[k] = +i.value;
    $<HTMLElement>(`output[data-k="${k}"]`).textContent = i.value + ' mm';
    draw();
  }
  async function loop(id: number) {
    cur.hidden = false;
    place([cfg.clientWidth * 0.3, cfg.clientHeight * 0.5]);
    while (id === run)
      for (const step of SEQ) {
        if (id !== run) return;
        if ('k' in step) {
          const k = step.k, row = slider(k).closest('.sl')!;
          cap.textContent = (phone() ? 'Przesuń suwak: ' : 'Chwyć wymiar: ') + NAMES[k];
          st.active = k;
          draw();
          row.classList.add('live');
          await moveTo(handlePt(k), 700, id);
          cur.classList.add('down');
          await sleep(250);
          const from = st[k], t0 = performance.now();
          for (;;) {
            if (id !== run) throw 0;
            const t = Math.min(1, (performance.now() - t0) / 1500);
            setVal(k, Math.round((from + (step.to - from) * ease(t)) / 5) * 5);
            place(handlePt(k));
            if (t >= 1) break;
            await frame();
          }
          await sleep(300);
          cur.classList.remove('down');
          row.classList.remove('live');
          st.active = null;
          draw();
          await sleep(500);
        } else {
          const b = 'lid' in step ? $<HTMLElement>(`.seg-lid [data-v="${step.lid}"]`) : $<HTMLElement>(`.seg-add [data-v="${step.add}"]`);
          cap.textContent = step.say;
          await moveTo(btnPt(b), 650, id);
          cur.classList.add('down');
          b.classList.add('tap');
          await sleep(180);
          if ('lid' in step) {
            st.lid = step.lid;
            cfg.querySelectorAll('.seg-lid button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          } else {
            st[step.add] = !st[step.add];
            b.setAttribute('aria-pressed', String(st[step.add]));
          }
          draw();
          b.classList.remove('tap');
          await sleep(250);
          cur.classList.remove('down');
          await sleep(700);
        }
      }
  }

  draw();
  let stopped = false;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const go = () => {
    if (stopped) return;
    if (still) {
      cur.hidden = true;
      cap.textContent = phone() ? 'Przesuń suwak' : 'Chwyć wymiar i przeciągnij';
    } else loop(run).catch(() => {});
  };
  // Every stop of the script, so the engine can build them all before the show starts.
  const stops: State[] = [{ ...st }];
  for (const step of SEQ) {
    const last = stops[stops.length - 1];
    stops.push('k' in step ? { ...last, [step.k]: step.to } : 'lid' in step ? { ...last, lid: step.lid } : { ...last, [step.add]: !last[step.add] });
  }
  // The show starts once the engine has drawn the real box; without WebGL it plays on the flat drawing.
  engineView($<HTMLElement>('.view'), stops)
    .then((v) => {
      if (stopped) return v.stop();
      eng = v;
      draw();
      svg.style.visibility = 'hidden';
      go();
    })
    .catch((e) => {
      console.warn('show engine', e);
      go();
    });
  return () => {
    stopped = true;
    run++;
    eng?.stop();
  };
}
