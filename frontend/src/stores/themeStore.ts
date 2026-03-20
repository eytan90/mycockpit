import { create } from 'zustand'

export type Theme = 'dark' | 'vibrant'

interface ThemeStore {
  theme: Theme
  setTheme: (t: Theme) => void
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

// Read from 'theme' key (new) or 'dd_theme' (legacy fallback)
const saved = (localStorage.getItem('theme') as Theme)
  || (localStorage.getItem('dd_theme') as Theme)
  || 'vibrant'
applyTheme(saved)

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: saved,
  setTheme: (theme) => {
    localStorage.setItem('theme', theme)
    localStorage.setItem('dd_theme', theme) // backward compat
    applyTheme(theme)
    set({ theme })
  },
}))
