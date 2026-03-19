import { create } from 'zustand'

export type Theme = 'dark' | 'vibrant'

interface ThemeStore {
  theme: Theme
  setTheme: (t: Theme) => void
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

const saved = (localStorage.getItem('dd_theme') as Theme) || 'vibrant'
applyTheme(saved)

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: saved,
  setTheme: (theme) => {
    localStorage.setItem('dd_theme', theme)
    applyTheme(theme)
    set({ theme })
  },
}))
