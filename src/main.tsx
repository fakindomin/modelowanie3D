import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { Shell } from './Shell';
import './styles.css';

// The whole app works in Z-up millimetres, like slicers and CAD tools.
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

createRoot(document.getElementById('root')!).render(<Shell />);
