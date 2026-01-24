'use client'

import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { SidebarProvider } from '@/contexts/SidebarContext'

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <SidebarProvider>
            <div className="min-h-screen flex flex-col">
                <Header />
                <div className="flex-1">
                    <Sidebar />
                    <main className="p-8 overflow-auto min-h-[calc(100vh-64px)]">
                        {children}
                    </main>
                </div>
            </div>
        </SidebarProvider>
    )
}

