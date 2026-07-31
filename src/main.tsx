import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Aplica o tema salvo antes do primeiro render, evitando flash de tema errado.
try {
  const stored = JSON.parse(localStorage.getItem('capex-dashboard-theme') || '{}');
  const theme = stored?.state?.theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
} catch {
  document.documentElement.setAttribute('data-theme', 'dark');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
