import { StrictMode, useEffect, useRef, useState, type ComponentType } from 'react';
import { initManifold } from './geom/manifold';
import { Landing, type StartAction } from './landing/Landing';

/**
 * One page for the start page and the editor. The start page shows at once while the 3D engine
 * loads behind it; #edytor in the address (or any click that opens a project) switches to the editor,
 * and the editor's logo comes back here.
 */
const inEditor = () => location.hash === '#edytor';

export function Shell() {
  const [editor, setEditor] = useState(inEditor);
  const [App, setApp] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<StartAction | null>(null);

  useEffect(() => {
    initManifold()
      .then(async () => {
        const m = await import('./App');
        setApp(() => m.App);
      })
      .catch((err) => {
        console.error(err);
        setError(String(err));
      });
    const on = () => setEditor(inEditor());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);

  // Leaving the editor (Back or the logo) closes a wizard, so the next pick starts clean.
  useEffect(() => {
    if (editor || !App) return;
    void import('./store').then(({ useStore }) => useStore.getState().openWizard(null));
  }, [editor, App]);

  useEffect(() => {
    if (!editor || !App || !pending.current) return;
    const a = pending.current;
    pending.current = null;
    if (a.kind === 'app') return;
    void import('./ui/runItem').then(async ({ runProjectItem }) => {
      if (a.kind === 'item') return runProjectItem(a.item);
      const { useStore } = await import('./store');
      useStore.getState().openWizard({ id: a.id });
    });
  }, [editor, App]);

  const open = (a: StartAction) => {
    pending.current = a;
    location.hash = 'edytor';
    setEditor(true);
    window.scrollTo(0, 0);
  };

  if (!editor) return <Landing onOpen={open} />;
  if (error) return <div className="loading">Nie udało się uruchomić silnika 3D: {error}</div>;
  if (!App) return <div className="loading">Ładowanie silnika 3D…</div>;
  return (
    <StrictMode>
      <App />
    </StrictMode>
  );
}
