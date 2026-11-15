import './style.css';
import { Game } from './game';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('App root missing');

new Game(root);

// basic PWA service worker registration (safe if missing in dev)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
