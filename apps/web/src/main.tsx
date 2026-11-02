import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.tsx';
import { AppProviders } from './context.tsx';
import './styles.css';
import './styles-v2.css';
import { applyCachedTheme, refreshTheme } from './lib/theme.ts';

// v2.2: apariencia elegida por el administrador (claro = sin cambios). Se refresca al abrir y cada 5 minutos.
applyCachedTheme();
void refreshTheme();
window.setInterval(() => void refreshTheme(), 5 * 60_000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProviders>
        <App />
      </AppProviders>
    </BrowserRouter>
  </StrictMode>,
);
