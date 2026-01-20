'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextType {
    theme: Theme
    toggleTheme: () => void
    setTheme: (theme: Theme) => void
    mounted: boolean
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const THEME_STORAGE_KEY = 'wps-theme-preference'

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>('dark')
    const [mounted, setMounted] = useState(false)

    // 从 localStorage 加载主题设置
    useEffect(() => {
        try {
            const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null
            if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
                setThemeState(savedTheme)
            } else {
                // 检测系统偏好
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
                setThemeState(prefersDark ? 'dark' : 'light')
            }
        } catch {
            // localStorage 不可用时使用默认值
        }
        setMounted(true)
    }, [])

    // 应用主题到 body
    useEffect(() => {
        if (mounted) {
            // 保留现有的 class 但更新主题 class
            const body = document.body
            body.classList.remove('theme-dark', 'theme-light')
            body.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light')
        }
    }, [theme, mounted])

    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light'
        setThemeState(newTheme)
        try {
            localStorage.setItem(THEME_STORAGE_KEY, newTheme)
        } catch {
            // localStorage 不可用时忽略
        }
    }

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme)
        try {
            localStorage.setItem(THEME_STORAGE_KEY, newTheme)
        } catch {
            // localStorage 不可用时忽略
        }
    }

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, mounted }}>
            {/* 防止闪烁 - 在客户端挂载前隐藏内容 */}
            <div style={{ visibility: mounted ? 'visible' : 'hidden' }}>
                {children}
            </div>
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    const context = useContext(ThemeContext)
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider')
    }
    return context
}

