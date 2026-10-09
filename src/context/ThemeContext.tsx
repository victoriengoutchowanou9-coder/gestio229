import React, { createContext, useContext, useState, useEffect } from 'react'

export type ThemeMode = 'clair' | 'sombre'

export interface ThemeContextType {
  theme: ThemeMode
  toggle: () => void
  isClair: boolean
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'sombre',
  toggle: () => {},
  isClair: false,
})

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'sombre'
    const saved = localStorage.getItem('gestio-theme') || localStorage.getItem('gestio_theme')
    if (saved === 'clair' || saved === 'light') return 'clair'
    return 'sombre'
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('gestio-theme', theme)
    localStorage.setItem('gestio_theme', theme === 'clair' ? 'light' : 'dark')
    document.documentElement.setAttribute('data-theme', theme)

    if (theme === 'clair') {
      document.documentElement.classList.remove('dark')
      document.documentElement.classList.add('light')
    } else {
      document.documentElement.classList.remove('light')
      document.documentElement.classList.add('dark')
    }
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'clair' ? 'sombre' : 'clair'))

  return (
    <ThemeContext.Provider value={{ theme, toggle, isClair: theme === 'clair' }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
export default ThemeContext
