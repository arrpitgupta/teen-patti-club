import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initPwa } from './lib/pwa';
import { getSocket } from './lib/socket';
import { unlockAudio } from './lib/sound';
import './index.css';

// Connect early so the first action doesn't wait for the handshake.
getSocket();
// Installable app: install prompt + offline shell.
initPwa();
// Sounds may only start after a user gesture (iOS): unlock on the first tap.
window.addEventListener('pointerdown', unlockAudio, { once: true });

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
