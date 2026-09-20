import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext()

function applyThemeToDom(currentTheme) {
  const root = document.documentElement
  const dark =
    currentTheme === 'dark' ||
    (currentTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  if (dark) {
    root.setAttribute('data-theme', 'dark')
    root.style.colorScheme = 'dark'
  } else {
    root.removeAttribute('data-theme')
    root.style.colorScheme = 'light'
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    return localStorage.getItem('theme') || 'light'
  })

  const setTheme = useCallback((next) => {
    // Apply synchronously so View Transitions capture the new theme in-callback.
    applyThemeToDom(next)
    localStorage.setItem('theme', next)
    setThemeState(next)
  }, [])

  useEffect(() => {
    applyThemeToDom(theme)
    localStorage.setItem('theme', theme)

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      if (theme === 'system') applyThemeToDom('system')
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
