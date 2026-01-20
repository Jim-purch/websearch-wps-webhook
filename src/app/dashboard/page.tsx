'use client'

import { useAuth } from '@/hooks/useAuth'
import { useTokens } from '@/hooks/useTokens'
import Link from 'next/link'

export default function DashboardPage() {
    const { user, isAdmin } = useAuth()
    const { tokens, isLoading } = useTokens()

    const activeTokens = tokens.filter(t => t.is_active).length
    const totalTokens = tokens.length

    return (
        <div className="max-w-6xl">
            {/* 欢迎区域 */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">
                    欢迎回来，{user?.display_name || '用户'}！
                </h1>
                <p className="text-[var(--text-muted)]">
                    这是您的 WPS Token 管理仪表板
                </p>
            </div>

            {/* 统计卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="card p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center text-2xl">
                            🔑
                        </div>
                        <div>
                            <p className="text-[var(--text-muted)] text-sm">总 Token 数</p>
                            <p className="text-2xl font-bold">
                                {isLoading ? '-' : totalTokens}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="card p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center text-2xl">
                            ✅
                        </div>
                        <div>
                            <p className="text-[var(--text-muted)] text-sm">活跃 Token</p>
                            <p className="text-2xl font-bold text-green-600">
                                {isLoading ? '-' : activeTokens}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="card p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-2xl">
                            🔗
                        </div>
                        <div>
                            <p className="text-[var(--text-muted)] text-sm">账户状态</p>
                            <p className="text-lg font-medium">
                                {isAdmin ? (
                                    <span className="text-purple-600">管理员</span>
                                ) : (
                                    <span className="text-blue-600">普通用户</span>
                                )}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* 快捷操作 */}
            <div className="card p-6">
                <h2 className="text-lg font-bold mb-4">快捷操作</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Link href="/dashboard/profile" className="flex items-center gap-3 p-4 border border-[var(--border)] rounded-lg hover:border-[#667eea] transition-colors">
                        <span className="text-2xl">📋</span>
                        <div>
                            <p className="font-medium">管理 Token</p>
                            <p className="text-sm text-[var(--text-muted)]">查看和管理您的 WPS Token</p>
                        </div>
                    </Link>

                    <Link href="/dashboard/profile" className="flex items-center gap-3 p-4 border border-[var(--border)] rounded-lg hover:border-[#667eea] transition-colors">
                        <span className="text-2xl">➕</span>
                        <div>
                            <p className="font-medium">新建 Token</p>
                            <p className="text-sm text-[var(--text-muted)]">添加新的 WPS 脚本令牌</p>
                        </div>
                    </Link>

                    <Link href="/dashboard/shares" className="flex items-center gap-3 p-4 border border-[var(--border)] rounded-lg hover:border-[#667eea] transition-colors">
                        <span className="text-2xl">🔗</span>
                        <div>
                            <p className="font-medium">分享管理</p>
                            <p className="text-sm text-[var(--text-muted)]">管理 Token 分享设置</p>
                        </div>
                    </Link>

                    <Link href="/dashboard/part-search" className="flex items-center gap-3 p-4 border border-[var(--border)] rounded-lg hover:border-[#eab308] transition-colors">
                        <span className="text-2xl">📦</span>
                        <div>
                            <p className="font-medium">件号搜索</p>
                            <p className="text-sm text-[var(--text-muted)]">在 WPS 表格中搜索件号</p>
                        </div>
                    </Link>

                    {isAdmin && (
                        <Link href="/admin/users" className="flex items-center gap-3 p-4 border border-[var(--border)] rounded-lg hover:border-[#667eea] transition-colors">
                            <span className="text-2xl">👥</span>
                            <div>
                                <p className="font-medium">用户管理</p>
                                <p className="text-sm text-[var(--text-muted)]">管理系统用户</p>
                            </div>
                        </Link>
                    )}
                </div>
            </div>
        </div>
    )
}
