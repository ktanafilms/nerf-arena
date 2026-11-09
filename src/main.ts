import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

const app = mount(App, { target: document.getElementById('app')! });

// Service worker para instalar como app y abrir sin conexión
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

export default app;
