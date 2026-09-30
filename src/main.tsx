import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Initialisation immédiate du thème clair/sombre pour éviter tout saut visuel
if (typeof window !== 'undefined') {
  const savedTheme = localStorage.getItem('gestio_theme')
  if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }

  // Enregistrement du Service Worker PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('[GESTIO 229 PWA] Service Worker actif :', reg.scope)
        })
        .catch((err) => {
          console.warn('[GESTIO 229 PWA] Échec enregistrement Service Worker :', err)
        })
    })
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
