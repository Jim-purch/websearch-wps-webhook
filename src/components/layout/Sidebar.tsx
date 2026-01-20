'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

const userNavItems = [
    { href: '/dashboard', label: '仪表板', icon: '📊' },
    { href: '/dashboard/tokens', label: 'Token 管理', icon: '🔑' },
    { href: '/dashboard/part-search', label: '件号搜索', icon: '📦' },
    { href: '/dashboard/shares', label: '分享管理', icon: '🔗' },
]

const adminNavItems = [
    { href: '/admin', label: '管理概览', icon: '⚙️' },
    { href: '/admin/users', label: '用户管理', icon: '👥' },
]

export function Sidebar() {
    const pathname = usePathname()
    const { user, isAdmin } = useAuth()

    return (
        <aside className="sidebar">
            {/* 用户信息 */}
            <div className="p-6 border-b border-[var(--border)]">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-white font-bold">
                        {user?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{user?.display_name || '用户'}</p>
                        <p className="text-sm text-[var(--text-muted)] truncate">{user?.email}</p>
                    </div>
                </div>
                {isAdmin && (
                    <span className="badge badge-success mt-3">管理员</span>
                )}
            </div>

            {/* 导航菜单 */}
            <nav className="py-4">
                <div className="px-4 mb-2">
                    <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                        用户面板
                    </span>
                </div>
                {userNavItems.map(item => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`sidebar-item ${pathname === item.href ? 'active' : ''}`}
                    >
                        <span>{item.icon}</span>
                        <span>{item.label}</span>
                    </Link>
                ))}

                {isAdmin && (
                    <>
                        <div className="px-4 mb-2 mt-6">
                            <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                                管理员
                            </span>
                        </div>
                        {adminNavItems.map(item => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`sidebar-item ${pathname === item.href ? 'active' : ''}`}
                            >
                                <span>{item.icon}</span>
                                <span>{item.label}</span>
                            </Link>
                        ))}
                    </>
                )}
            </nav>
        </aside>
    )
}
