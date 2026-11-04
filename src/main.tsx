import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { initManifold } from './geom/manifold';
import './styles.css';

// The whole app works in Z-up millimetres, like slicers and CAD tools.
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

const root = createRoot(document.getElementById('root')!);
root.render(<div className="loading">Ładowanie silnika 3D…</div>);

initManifold()
  .then(async () => {
    const { App } = await import('./App');
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((err) => {
    console.error(err);
    root.render(<div className="loading">Nie udało się uruchomić silnika 3D: {String(err)}</div>);
  });
