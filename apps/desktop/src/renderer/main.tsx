import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';
import './styles-v2.css';
import { applyCachedTheme, refreshTheme } from './lib/theme.ts';

// v2.2: apariencia elegida por el administrador (claro = sin cambios). Se refresca al abrir y cada minuto.
applyCachedTheme();
void refreshTheme();
window.setInterval(() => void refreshTheme(), 60_000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
