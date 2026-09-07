import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { useStore } from './stores'
import './styles/globals.css'

if (import.meta.env.DEV) {
  // Dev-only hook so external tooling (CDP) can drive real store actions.
  ;(window as unknown as Record<string, unknown>).__store = useStore
}

async function bootstrap(): Promise<void> {
  // Resolve theme before first paint so there is no flicker.
  try {
    const state = await window.api.window.getState()
    const dark = state.themePref === 'system' ? state.systemDark : state.themePref === 'dark'
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.documentElement.classList.toggle('dark', dark)
  } catch {
    document.documentElement.dataset.theme = 'light'
  }

  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void bootstrap()
