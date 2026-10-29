import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useStore } from '../store';
import { buildBodies, built } from '../geom/parts';
import { WIZARDS, WIZARD_GROUPS } from '../wizards';
import { estimate, fmtH, fmtKg, type Estimate } from '../wizards/estimate';
import type { Field, Plan, Wizard } from '../wizards/types';
import type { Part, WizValues } from '../types';

const DEG = Math.PI / 180;

/** Project wizards: a gallery, then steps on the left, the model building itself in the middle and a running summary on the right. */
export function WizardDialog() {
  const w = useStore((s) => s.wizard);
  const openWizard = useStore((s) => s.openWizard);
  useEffect(() => {
    if (!w) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openWizard(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [w, openWizard]);
  if (!w) return null;
  const wz = w.id ? WIZARDS[w.id] : undefined;
  return (
    <div className="wiz" role="dialog" aria-label="Kreator projektu">
      <header className="wiz-bar">
        <span className="brand">
          <span className="logo">◆</span> Modelowanie 3D
        </span>
        <span className="wiz-crumb">
          <button className="linklike" onClick={() => openWizard({ id: null })} disabled={!wz || !!w.run}>
            Kreatory
          </button>
          {wz && (
            <>
              {' › '}
              <b>{wz.label}</b>
            </>
          )}
        </span>
        {w.run && <span className="badge">edycja projektu z kreatora</span>}
        <button className="wiz-close" onClick={() => openWizard(null)}>
          Anuluj
        </button>
      </header>
      {wz ? <Steps key={wz.id + (w.run ?? '')} wz={wz} initial={{ ...wz.defaults, ...(w.values ?? {}) }} run={w.run} /> : <Gallery />}
    </div>
  );
}

function Gallery() {
  const openWizard = useStore((s) => s.openWizard);
  return (
    <div className="wiz-gallery">
      <h2>Co budujemy?</h2>
      <p className="desc">Kreator prowadzi krok po kroku, a model powstaje na żywo. Na końcu dostajesz zwykły projekt do dalszej edycji i instrukcję: co wydrukować, co kupić i jak złożyć.</p>
      {WIZARD_GROUPS.map((g) => (
        <section key={g.label}>
          <h3>{g.label}</h3>
          <div className="wiz-cards">
            {g.items.map((it) => (
              <button key={it.id} className={it.ready ? 'wiz-card' : 'wiz-card soon'} disabled={!it.ready} onClick={() => openWizard({ id: it.id })}>
                <span className="t">{it.label}</span>
                <span className="d">{it.desc}</span>
                {!it.ready && <span className="badge">wkrótce</span>}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Steps({ wz, initial, run }: { wz: Wizard; initial: WizValues; run?: string }) {
  const st = useStore.getState();
  const [values, setValues] = useState<WizValues>(initial);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<{ plan: Plan; est: Estimate; values: WizValues } | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Rebuild a moment after the last change (sliders send many), so the screen can say it is working.
  useEffect(() => {
    setBusy(true);
    const t = setTimeout(() => {
      try {
        const plan = wz.plan(values);
        const est = estimate(plan.items, plan.bed);
        setResult({ plan, est, values });
        setError(null);
      } catch (e) {
        console.warn('wizard plan failed', e);
        setError('Nie udało się przeliczyć ramy dla tych odpowiedzi.');
      }
      setBusy(false);
    }, 220);
    return () => clearTimeout(t);
  }, [values, wz]);

  const set = (key: string, v: string | number | boolean) => setValues((cur) => wz.set(cur, key, v));
  const s = wz.steps[step];
  const last = step === wz.steps.length - 1;
  const plan = result?.plan ?? null;
  const create = (manual: boolean) => {
    st.applyWizard(wz.id, values, run);
    if (manual) st.setManual(true);
  };

  return (
    <div className="wiz-main">
      <aside className="wiz-steps">
        <div className="wiz-progress">
          {wz.steps.map((x, k) => (
            <button key={x.title} className={k < step ? 'done' : k === step ? 'on' : ''} title={`${k + 1}. ${x.title}`} aria-label={`Krok ${k + 1}: ${x.title}`} onClick={() => setStep(k)} />
          ))}
        </div>
        <div className="wiz-head">
          <div className="wiz-n">
            Krok {step + 1} z {wz.steps.length}
          </div>
          <h2>{s.title}</h2>
          <p className="desc">{s.desc}</p>
        </div>
        <div className="wiz-body">
          {s.fields(values, plan).map((f, i) => (
            <FieldView key={i} f={f} values={values} set={set} />
          ))}
          {last && plan && (
            <>
              <table className="wiz-table">
                <thead>
                  <tr>
                    <th>Nr</th>
                    <th>Część</th>
                    <th className="n">Ilość</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.items.map((it) => (
                    <tr key={it.role}>
                      <td>
                        <i className="dot" style={{ background: it.color }} /> {it.role}
                      </td>
                      <td>
                        {it.name}
                        <br />
                        <span className="muted">
                          {it.where} · {it.material}
                        </span>
                      </td>
                      <td className="n">{it.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {plan.buy.length > 0 && (
                <div className="wiz-buy">
                  <b>Do kupienia</b>
                  <ul>
                    {plan.buy.map((b) => (
                      <li key={b.name}>
                        {b.name}: {b.qty}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
        <footer className="wiz-foot">
          {last ? (
            <>
              <button className="primary" disabled={!plan || busy} onClick={() => create(false)}>
                {run ? 'Zapisz zmiany w projekcie' : 'Utwórz projekt'}
              </button>
              <button disabled={!plan || busy} onClick={() => create(true)}>
                {run ? 'Zapisz i pokaż instrukcję' : 'Utwórz i pokaż instrukcję'}
              </button>
              <button onClick={() => setStep(step - 1)}>← Wstecz</button>
            </>
          ) : (
            <>
              <button disabled={step === 0} onClick={() => setStep(step - 1)}>
                ← Wstecz
              </button>
              <button className="primary" onClick={() => setStep(step + 1)}>
                Dalej →
              </button>
            </>
          )}
        </footer>
      </aside>
      <section className="wiz-view">
        {plan && <PreviewCanvas plan={plan} focus={s.focus} />}
        <div className="wiz-focus">
          Teraz: <b>{s.focusLabel}</b>
          {busy && <span className="wiz-busy"> · przeliczam…</span>}
        </div>
        {error && <div className="wiz-error">{error}</div>}
        {plan && !plan.parts && <BedInset plan={plan} pipe={Number(values.pipe) || 20} />}
        <div className="wiz-hint">Przeciągnij, żeby obrócić · kółko: przybliż</div>
      </section>
      <aside className="wiz-sum">
        <h4>Na bieżąco</h4>
        {result && (
          <div className="kpis">
            <div>
              <b>{result.est.pieces}</b>
              <span>części do druku</span>
            </div>
            <div>
              <b>{fmtKg(result.est.grams)}</b>
              <span>filament</span>
            </div>
            <div>
              <b>{fmtH(result.est.hours)}</b>
              <span>druk (około)</span>
            </div>
            <div>
              <b>{result.est.plates}</b>
              <span>stołów</span>
            </div>
          </div>
        )}
        <h4>Części</h4>
        <ul className="wiz-list">
          {plan?.items.map((it) => (
            <li key={it.role}>
              <i className="dot" style={{ background: it.color }} />
              <span>
                {it.role} {it.name}
              </span>
              <b>× {it.qty}</b>
            </li>
          ))}
        </ul>
        <h4>Uwagi</h4>
        {plan?.notes.map((n) => (
          <div key={n.text} className={n.warn ? 'wiz-note warn' : 'wiz-note'}>
            {n.text}
          </div>
        ))}
      </aside>
    </div>
  );
}

function FieldView({ f, values, set }: { f: Field; values: WizValues; set: (k: string, v: string | number | boolean) => void }) {
  if (f.kind === 'hint') return <div className="hint">{f.text}</div>;
  if (f.kind === 'toggle')
    return (
      <label className="wiz-toggle">
        <input type="checkbox" checked={!!values[f.key]} onChange={(e) => set(f.key, e.target.checked)} />
        <span>
          <b>{f.label}</b>
          <br />
          <span className="muted">{f.desc}</span>
        </span>
      </label>
    );
  if (f.kind === 'text')
    return (
      <label className="wiz-slider">
        <span>{f.label}</span>
        <input className="wiz-text" type="text" value={String(values[f.key] ?? '')} maxLength={f.max ?? 40} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
      </label>
    );
  if (f.kind === 'slider')
    return (
      <label className="wiz-slider">
        <span>
          {f.label}
          <b>
            {String(values[f.key])} {f.unit}
          </b>
        </span>
        <input type="range" min={f.min} max={f.max} step={f.step} value={Number(values[f.key])} onChange={(e) => set(f.key, Number(e.target.value))} />
      </label>
    );
  return (
    <div className="wiz-field">
      {f.label && <span className="wiz-label">{f.label}</span>}
      <div className={`wiz-tiles c${f.cols ?? 2}`}>
        {f.options.map((o) => (
          <button key={String(o.value)} className={values[f.key] === o.value ? 'wiz-tile on' : 'wiz-tile'} onClick={() => set(f.key, o.value)}>
            {o.icon && (
              <svg viewBox="0 0 100 48" aria-hidden="true">
                <path d={o.icon} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            )}
            <span className="t">{o.label}</span>
            {o.desc && <span className="d">{o.desc}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The longest printed piece standing on the chosen printer's bed. */
function BedInset({ plan, pipe }: { plan: Plan; pipe: number }) {
  const [bx, , bz] = plan.bed;
  const s = 70 / bz, h = Math.min(plan.longest, bz * 1.15) * s;
  const over = plan.longest > bz;
  return (
    <div className="wiz-bed">
      <div className="muted">Najdłuższy odcinek na stole</div>
      <svg width="120" height="88" viewBox="0 0 120 88" aria-label="Odcinek na stole drukarki">
        <rect x="10" y="12" width={bx * s} height={bz * s} fill="none" stroke="#5a5d62" strokeDasharray="3 3" />
        <line x1="4" y1={12 + bz * s} x2={16 + bx * s} y2={12 + bz * s} stroke="#9b9d9f" />
        <rect x={10 + (bx * s) / 2 - Math.max(3, pipe * s) / 2} y={12 + bz * s - h} width={Math.max(3, pipe * s)} height={h} fill={over ? '#e06363' : '#5b9be8'} />
        <text x={16 + bx * s} y="9" fill="#9b9d9f" fontSize="9" textAnchor="end">
          {Math.round(plan.longest)} / {bz} mm
        </text>
      </svg>
    </div>
  );
}

function PreviewCanvas({ plan, focus }: { plan: Plan; focus: string[] }) {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [1500, -2000, 1500], fov: 35, near: 5, far: 50000, up: [0, 0, 1] }}>
      <color attach="background" args={['#161718']} />
      <hemisphereLight args={['#ffffff', '#404448', 1.1]} />
      <directionalLight position={[2000, -3000, 4000]} intensity={1.4} />
      <directionalLight position={[-2000, 2000, 1500]} intensity={0.4} />
      <gridHelper args={[6000, 60, '#3a3d42', '#26282b']} rotation-x={Math.PI / 2} />
      <Frame plan={plan} focus={focus} />
      <OrbitControls makeDefault enableDamping={false} />
    </Canvas>
  );
}

function Frame({ plan, focus }: { plan: Plan; focus: string[] }) {
  const mats = useMemo(() => new Map<string, THREE.MeshStandardMaterial>(), []);
  const mat = (color: string, dim: boolean) => {
    const k = color + (dim ? 'd' : '');
    let m = mats.get(k);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, transparent: dim, opacity: dim ? 0.16 : 1, depthWrite: !dim });
      mats.set(k, m);
    }
    return m;
  };
  const byRole = useMemo(() => new Map(plan.items.map((it) => [it.role, it])), [plan]);
  const [W, D, H] = plan.size;
  const { camera, controls } = useThree();
  const key = `${Math.round(W / 50)}/${Math.round(D / 50)}/${Math.round(H / 50)}`;
  useEffect(() => {
    const r = Math.max(W, D, H);
    const target = new THREE.Vector3(0, 0, H / 2);
    camera.position.copy(target).add(new THREE.Vector3(0.75, -1.05, 0.55).normalize().multiplyScalar(r * 2.5 + 60));
    camera.lookAt(target);
    const c = controls as unknown as { target: THREE.Vector3; update(): void } | null;
    if (c) {
      c.target.copy(target);
      c.update();
    }
    // Only when the size changes noticeably, so orbiting survives small edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, controls]);
  // Ready parts (boxes, lids): shown as printed, holes cut.
  const bodies = useMemo(() => (plan.parts ? buildBodies(plan.parts) : []), [plan]);
  useEffect(
    () => () =>
      bodies.forEach((b) => {
        b.geometry.dispose();
        b.manifold.delete();
      }),
    [bodies],
  );
  return (
    <group position={[-W / 2, -D / 2, 0]}>
      {bodies.map((b) => (
        <mesh key={'r' + b.body} geometry={b.geometry} material={mat(b.color, false)} />
      ))}
      {plan.placements.map((pl, i) => {
        const it = byRole.get(pl.role)!;
        const g = built({ type: it.type, params: it.params } as Part).geometry;
        const dim = focus.length > 0 && !focus.includes(it.group);
        return <mesh key={i} geometry={g} material={mat(it.color, dim)} position={pl.position} rotation={[pl.rotation[0] * DEG, pl.rotation[1] * DEG, pl.rotation[2] * DEG]} />;
      })}
      {plan.boards?.map((b, i) => (
        <mesh key={'b' + i} position={b.position} material={mat('#c8b38a', focus.length > 0)}>
          <boxGeometry args={b.size} />
        </mesh>
      ))}
    </group>
  );
}
