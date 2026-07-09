'use client'

import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { useSidebar } from '@/contexts/SidebarContext'

export function Header() {
    const { user, isAdmin, signOut } = useAuth()
    const router = useRouter()
    const { openSidebar } = useSidebar()

    const handleSignOut = async () => {
        await signOut()
        router.push('/login')
    }

    return (
        <header className="header">
            <div className="flex items-center gap-3">
                {/* 菜单按钮 */}
                <button
                    onClick={openSidebar}
                    className="
                        w-10 h-10 rounded-lg
                        bg-white/10 hover:bg-white/20
                        text-white
                        transition-all duration-200
                        flex items-center justify-center
                        hover:scale-105 active:scale-95
                    "
                    title="打开菜单"
                    aria-label="打开菜单"
                >
                    <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                </button>

                <Link href="/dashboard" className="text-xl font-bold text-white hover:opacity-90">
                    🔐 云表格快速查找
                </Link>
            </div>

            <div className="flex items-center gap-4">
                {user && (
                    <>
                        <span className="text-white/80 text-sm">
                            {user.display_name || user.email}
                            {isAdmin && <span className="ml-2 text-xs bg-white/20 px-2 py-0.5 rounded">管理员</span>}
                        </span>
                        <button
                            onClick={handleSignOut}
                            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm transition-all"
                        >
                            退出登录
                        </button>
                    </>
                )}
            </div>
        </header>
    )
}
