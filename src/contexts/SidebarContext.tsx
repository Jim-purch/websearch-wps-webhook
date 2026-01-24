'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface SidebarContextType {
    isOpen: boolean
    openSidebar: () => void
    closeSidebar: () => void
    toggleSidebar: () => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

export function SidebarProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false)

    const openSidebar = useCallback(() => setIsOpen(true), [])
    const closeSidebar = useCallback(() => setIsOpen(false), [])
    const toggleSidebar = useCallback(() => setIsOpen(prev => !prev), [])

    return (
        <SidebarContext.Provider value={{ isOpen, openSidebar, closeSidebar, toggleSidebar }}>
            {children}
        </SidebarContext.Provider>
    )
}

export function useSidebar() {
    const context = useContext(SidebarContext)
    if (context === undefined) {
        throw new Error('useSidebar must be used within a SidebarProvider')
    }
    return context
}

