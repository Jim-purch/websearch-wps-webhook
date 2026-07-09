'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/contexts/ThemeContext'
import { useSidebar } from '@/contexts/SidebarContext'

const userNavItems = [
    { href: '/dashboard', label: '仪表板', icon: '📊' },
    { href: '/dashboard/part-search', label: '件号搜索', icon: '📦' },
    { href: '/dashboard/profile#tokens', label: '管理 Token', icon: '🔑' },
    { href: '/dashboard/shares', label: '分享管理', icon: '🔗' },
    { href: '/dashboard/profile', label: '用户管理', icon: '👤' },
]

const adminNavItems = [
    { href: '/admin', label: '管理概览', icon: '⚙️' },
    { href: '/admin/users', label: '用户列表', icon: '👥' },
    { href: '/admin/system-config', label: '系统配置', icon: '🛠️' },
]

export function Sidebar() {
    const pathname = usePathname()
    const { user, isAdmin } = useAuth()
    const { theme, toggleTheme } = useTheme()
    const { isOpen, closeSidebar } = useSidebar()
    const prevPathnameRef = useRef(pathname)

    // 路由变化时自动关闭侧边栏（仅在 pathname 真正变化时）
    useEffect(() => {
        if (prevPathnameRef.current !== pathname) {
            closeSidebar()
            prevPathnameRef.current = pathname
        }
    }, [pathname, closeSidebar])

    // 按 ESC 键关闭侧边栏
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeSidebar()
        }
        window.addEventListener('keydown', handleEsc)
        return () => window.removeEventListener('keydown', handleEsc)
    }, [closeSidebar])

    // 打开侧边栏时禁止背景滚动
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => {
            document.body.style.overflow = ''
        }
    }, [isOpen])

    return (
        <>
            {/* 遮罩层 */}
            <div
                className={`
                    fixed inset-0 bg-black/50 backdrop-blur-sm z-40
                    transition-opacity duration-300
                    ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
                `}
                onClick={closeSidebar}
                aria-hidden="true"
            />

            {/* 侧边栏抽屉 */}
            <aside
                className={`
                    fixed top-0 left-0 z-50
                    w-[280px] h-full
                    bg-[var(--card-bg)] 
                    border-r border-[var(--border)]
                    shadow-2xl
                    transition-transform duration-300 ease-out
                    flex flex-col
                    ${isOpen ? 'translate-x-0' : '-translate-x-full'}
                `}
            >
                {/* 顶部栏 */}
                <div className="flex justify-between items-center p-4 border-b border-[var(--border)]">
                    <button
                        onClick={toggleTheme}
                        className="w-10 h-10 rounded-lg bg-[var(--hover-bg)] hover:bg-[var(--highlight-bg)] flex items-center justify-center transition-colors"
                        title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
                    >
                        {theme === 'dark' ? '🌙' : '☀️'}
                    </button>
                    <button
                        onClick={closeSidebar}
                        className="w-10 h-10 rounded-lg bg-[var(--hover-bg)] hover:bg-red-500/20 hover:text-red-500 flex items-center justify-center transition-colors text-[var(--text-muted)]"
                        title="关闭菜单"
                        aria-label="关闭菜单"
                    >
                        <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                {/* 用户信息 */}
                <div className="p-4 border-b border-[var(--border)]">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-lg shrink-0 shadow-md">
                            {user?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate text-[var(--foreground)]">
                                {user?.display_name || '用户'}
                            </p>
                            <p className="text-sm text-[var(--text-muted)] truncate">
                                {user?.email}
                            </p>
                        </div>
                    </div>
                    {isAdmin && (
                        <span className="inline-flex items-center gap-1 mt-3 px-2.5 py-1 text-xs font-medium rounded-full bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                            ⭐ 管理员
                        </span>
                    )}
                </div>

                {/* 导航菜单 */}
                <nav className="flex-1 py-4 overflow-y-auto">
                    <div className="px-4 mb-3">
                        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                            用户面板
                        </span>
                    </div>

                    <div className="space-y-1 px-2">
                        {userNavItems.map(item => (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={closeSidebar}
                                className={`
                                    flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                                    ${pathname === item.href
                                        ? 'bg-gradient-to-r from-[#667eea]/20 to-[#764ba2]/20 text-[#667eea] shadow-sm border border-[#667eea]/20'
                                        : 'text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[#667eea]'
                                    }
                                `}
                            >
                                <span className="text-xl">{item.icon}</span>
                                <span className="font-medium">{item.label}</span>
                                {pathname === item.href && (
                                    <span className="ml-auto w-2 h-2 rounded-full bg-[#667eea]" />
                                )}
                            </Link>
                        ))}
                    </div>

                    {isAdmin && (
                        <>
                            <div className="px-4 mb-3 mt-6">
                                <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                                    管理员
                                </span>
                            </div>

                            <div className="space-y-1 px-2">
                                {adminNavItems.map(item => (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={closeSidebar}
                                        className={`
                                            flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                                            ${pathname === item.href
                                                ? 'bg-gradient-to-r from-[#667eea]/20 to-[#764ba2]/20 text-[#667eea] shadow-sm border border-[#667eea]/20'
                                                : 'text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[#667eea]'
                                            }
                                        `}
                                    >
                                        <span className="text-xl">{item.icon}</span>
                                        <span className="font-medium">{item.label}</span>
                                        {pathname === item.href && (
                                            <span className="ml-auto w-2 h-2 rounded-full bg-[#667eea]" />
                                        )}
                                    </Link>
                                ))}
                            </div>
                        </>
                    )}
                </nav>

                {/* 底部版本信息 */}
                <div className="p-4 border-t border-[var(--border)] text-center">
                    <p className="text-xs text-[var(--text-muted)]">
                        云表格快速查找 v1.0
                    </p>
                </div>
            </aside>
        </>
    )
}

