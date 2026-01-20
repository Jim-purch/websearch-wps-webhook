'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/contexts/ThemeContext'

const userNavItems = [
    { href: '/dashboard', label: '仪表板', icon: '📊' },
    { href: '/dashboard/part-search', label: '件号搜索', icon: '📦' },
    { href: '/dashboard/shares', label: '分享管理', icon: '🔗' },
    { href: '/dashboard/profile', label: '用户管理', icon: '👤' },
]

const adminNavItems = [
    { href: '/admin', label: '管理概览', icon: '⚙️' },
    { href: '/admin/users', label: '用户列表', icon: '👥' },
]

export function Sidebar() {
    const pathname = usePathname()
    const { user, isAdmin } = useAuth()
    const { theme, toggleTheme } = useTheme()
    const [isCollapsed, setIsCollapsed] = useState(true)

    return (
        <aside
            className={`
                bg-[var(--card-bg)] border-r border-[var(--border)] min-h-screen transition-all duration-300 flex flex-col
                ${isCollapsed ? 'w-16' : 'w-[260px]'}
            `}
            style={{ width: isCollapsed ? '4rem' : '260px' }}
        >
            {/* Toggle Button */}
            <div className="flex justify-between items-center p-2">
                {!isCollapsed && (
                    <button
                        onClick={toggleTheme}
                        className="theme-toggle-btn"
                        title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
                    >
                        {theme === 'dark' ? '🌙' : '☀️'}
                    </button>
                )}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="p-1 hover:bg-[var(--hover-bg)] rounded text-[var(--text-muted)] ml-auto"
                    title={isCollapsed ? '展开' : '收起'}
                >
                    {isCollapsed ? '➡️' : '⬅️'}
                </button>
            </div>

            {/* Collapsed state theme toggle */}
            {isCollapsed && (
                <div className="flex justify-center mb-2">
                    <button
                        onClick={toggleTheme}
                        className="theme-toggle-btn"
                        title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
                        style={{ width: '36px', height: '36px' }}
                    >
                        {theme === 'dark' ? '🌙' : '☀️'}
                    </button>
                </div>
            )}

            {/* 用户信息 */}
            <div className={`p-4 border-b border-[var(--border)] overflow-hidden transition-all ${isCollapsed ? 'px-2' : ''}`}>
                <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
                    <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-white font-bold shrink-0">
                        {user?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
                    </div>

                    {!isCollapsed && (
                        <div className="flex-1 min-w-0 animate-in fade-in duration-300">
                            <p className="font-medium truncate text-[var(--foreground)]">{user?.display_name || '用户'}</p>
                            <p className="text-sm text-[var(--text-muted)] truncate">{user?.email}</p>
                        </div>
                    )}
                </div>
                {!isCollapsed && isAdmin && (
                    <span className="badge badge-success mt-3 w-fit animate-in fade-in">管理员</span>
                )}
            </div>

            {/* 导航菜单 */}
            <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
                {!isCollapsed && (
                    <div className="px-4 mb-2 animate-in fade-in">
                        <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                            用户面板
                        </span>
                    </div>
                )}

                <div className="space-y-1">
                    {userNavItems.map(item => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`
                                flex items-center gap-3 px-4 py-3 transition-colors
                                ${pathname === item.href
                                    ? 'bg-[var(--highlight-bg)] text-[#667eea] border-r-2 border-[#667eea]'
                                    : 'text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[#667eea]'
                                }
                                ${isCollapsed ? 'justify-center px-2' : ''}
                            `}
                            title={isCollapsed ? item.label : ''}
                        >
                            <span className="text-xl shrink-0">{item.icon}</span>
                            {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
                        </Link>
                    ))}
                </div>

                {isAdmin && (
                    <>
                        {!isCollapsed && (
                            <div className="px-4 mb-2 mt-6 animate-in fade-in">
                                <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                                    管理员
                                </span>
                            </div>
                        )}
                        {isCollapsed && <div className="my-2 border-t border-[var(--border)]" />}

                        <div className="space-y-1">
                            {adminNavItems.map(item => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`
                                        flex items-center gap-3 px-4 py-3 transition-colors
                                        ${pathname === item.href
                                            ? 'bg-[var(--highlight-bg)] text-[#667eea] border-r-2 border-[#667eea]'
                                            : 'text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[#667eea]'
                                        }
                                        ${isCollapsed ? 'justify-center px-2' : ''}
                                    `}
                                    title={isCollapsed ? item.label : ''}
                                >
                                    <span className="text-xl shrink-0">{item.icon}</span>
                                    {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
                                </Link>
                            ))}
                        </div>
                    </>
                )}
            </nav>
        </aside>
    )
}

