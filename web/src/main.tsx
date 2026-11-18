import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/noto-sans-bengali/400.css';
import '@fontsource/noto-sans-bengali/600.css';
import '@fontsource/noto-sans-bengali/700.css';
import '@fontsource/hind-siliguri/400.css';
import '@fontsource/hind-siliguri/700.css';
import '@fontsource/anek-bangla/400.css';
import '@fontsource/anek-bangla/700.css';
import '@fontsource/noto-serif-bengali/400.css';
import '@fontsource/noto-serif-bengali/700.css';
import '@fontsource/baloo-da-2/400.css';
import '@fontsource/baloo-da-2/700.css';
import '@fontsource/tiro-bangla/400.css';
import '@fontsource/atma/400.css';
import '@fontsource/atma/700.css';
import '@fontsource/mina/400.css';
import '@fontsource/mina/700.css';
import '@fontsource/galada/400.css';
import '@fontsource/merriweather/400.css';
import '@fontsource/merriweather/700.css';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/700.css';
import '@fontsource/caveat/400.css';
import '@fontsource/caveat/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/700.css';
import '@fontsource/lora/400.css';
import '@fontsource/lora/700.css';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Lets the browser offer to install the app. The worker caches nothing.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
