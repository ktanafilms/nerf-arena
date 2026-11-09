import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

const app = mount(App, { target: document.getElementById('app')! });

// Service worker para instalar como app y abrir sin conexión
if ('serviceWorker' in navigator && import.meta.env.PROD && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

export default app;
