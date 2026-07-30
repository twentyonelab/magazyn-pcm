import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { initTheme } from './theme.js';
import './styles.css';

// Motyw ustawiamy przed pierwszym renderem, żeby strona nie mrugnęła jasnym
// tłem, zanim React zdąży się zamontować.
initTheme();

const root = document.getElementById('root');
if (!root) throw new Error('Brak elementu #root w index.html');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
