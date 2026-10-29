import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { itemPicture, makeManual, modelPicture, piecesText, type Manual as ManualData } from '../manual';
import { fmtH, fmtKg } from '../wizards/estimate';

const mm = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

/** Project manual over the editor: prints (or saves as PDF) on white pages. */
export function Manual() {
  const open = useStore((s) => s.manual);
  const setManual = useStore((s) => s.setManual);
  const [data, setData] = useState<{ m: ManualData; cover: string; pics: string[] } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setError(false);
    // Let the "preparing" screen paint first: building every print takes a moment.
    const t = setTimeout(() => {
      try {
        const parts = useStore.getState().parts;
        const m = makeManual(parts);
        setData({ m, cover: modelPicture(parts), pics: m.items.map(itemPicture) });
      } catch (e) {
        console.warn('manual failed', e);
        setError(true);
      }
    }, 60);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setManual(false);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setManual]);

  if (!open) return null;
  const m = data?.m;
  const date = new Date().toLocaleDateString('pl-PL');
  return (
    <div className="manual" role="dialog" aria-label="Instrukcja projektu">
      <div className="manual-bar">
        <b>Instrukcja projektu</b>
        <span className="muted">Drukuj albo wybierz „Zapisz jako PDF” w oknie drukowania.</span>
        <button className="primary" disabled={!m} onClick={() => window.print()}>
          🖨 Drukuj / PDF
        </button>
        <button onClick={() => setManual(false)}>Zamknij</button>
      </div>
      <div className="manual-scroll">
        {!m && !error && <div className="manual-wait">Przygotowuję instrukcję: buduję każdą część i liczę filament…</div>}
        {error && <div className="manual-wait">Nie udało się przygotować instrukcji dla tego modelu.</div>}
        {m && !m.items.length && <div className="manual-wait">Model jest pusty. Dodaj elementy albo użyj kreatora.</div>}
        {m && data && m.items.length > 0 && (
          <>
            <section className="page">
              <div className="page-head">
                <span>Modelowanie 3D · instrukcja</span>
                <span>{date}</span>
              </div>
              <h1>{m.title}</h1>
              {data.cover && <img className="cover" src={data.cover} alt="Cały model" />}
              <div className="mkpis">
                <div>
                  <b>{m.items.length}</b>
                  <span>rodzajów części</span>
                </div>
                <div>
                  <b>{m.pieces}</b>
                  <span>{piecesText(m.pieces).replace(/^\d+ /, '')}</span>
                </div>
                <div>
                  <b>{fmtKg(m.grams)}</b>
                  <span>filament</span>
                </div>
                <div>
                  <b>{fmtH(m.hours)}</b>
                  <span>druk (około)</span>
                </div>
              </div>
              <ol className="toc">
                <li>Do wydrukowania</li>
                {m.buy.length > 0 && <li>Do kupienia</li>}
                {(m.fits.length > 0 || m.items.some((i) => i.where)) && <li>Co do czego pasuje</li>}
                {m.steps.length > 0 && <li>Kolejność składania</li>}
              </ol>
              {m.notes.length > 0 && (
                <div className="mnotes">
                  {m.notes.map((n) => (
                    <p key={n.text} className={n.warn ? 'warn' : ''}>
                      {n.text}
                    </p>
                  ))}
                </div>
              )}
            </section>

            <section className="page">
              <h2>Do wydrukowania</h2>
              <p className="lead">Każda karta to jeden rodzaj części. Wydrukuj tyle sztuk, ile podaje „×”. Waga dotyczy jednej sztuki.</p>
              <div className="cards">
                {m.items.map((it, i) => (
                  <div key={it.no + i} className="card">
                    <img src={data.pics[i]} alt={it.name} />
                    <div className="card-head">
                      <span className="no">{it.no}</span>
                      <span className="nm">{it.name}</span>
                      <span className="qty">× {it.qty}</span>
                    </div>
                    <dl>
                      <dt>Wymiary</dt>
                      <dd>
                        {mm(it.size[0])} × {mm(it.size[1])} × {mm(it.size[2])} mm
                      </dd>
                      <dt>Materiał</dt>
                      <dd>
                        {it.material}, {fmtKg(it.grams)}
                      </dd>
                      <dt>Druk</dt>
                      <dd>{it.how}</dd>
                      {it.where && (
                        <>
                          <dt>Gdzie</dt>
                          <dd>{it.where}</dd>
                        </>
                      )}
                      {it.note && (
                        <>
                          <dt>Notatka</dt>
                          <dd>{it.note}</dd>
                        </>
                      )}
                    </dl>
                  </div>
                ))}
              </div>
            </section>

            {m.buy.length > 0 && (
              <section className="page">
                <h2>Do kupienia</h2>
                <table className="mtable">
                  <thead>
                    <tr>
                      <th>Co</th>
                      <th>Ile</th>
                      <th>Uwagi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.buy.map((b) => (
                      <tr key={b.name}>
                        <td>{b.name}</td>
                        <td className="n">{b.qty}</td>
                        <td>{b.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {(m.fits.length > 0 || m.items.some((i) => i.where)) && (
              <section className="page">
                <h2>Co do czego pasuje</h2>
                {m.items.some((i) => i.where) && (
                  <table className="mtable">
                    <tbody>
                      {m.items
                        .filter((i) => i.where)
                        .map((i) => (
                          <tr key={i.no}>
                            <td className="no">{i.no}</td>
                            <td>{i.name}</td>
                            <td>{i.where}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
                {m.fits.length > 0 && (
                  <ul className="fits">
                    {m.fits.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {m.steps.length > 0 && (
              <section className="page">
                <h2>Kolejność składania</h2>
                <ol className="steps">
                  {m.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
