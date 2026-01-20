'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { LoginLog, TokenUsageLog, SystemStatistics } from '@/types'

type TabType = 'overview' | 'logins' | 'tokenUsage'

const StatCard = ({ icon, label, value, subLabel }: { icon: string; label: string; value: number; subLabel?: string }) => (
    <div className="card p-6">
        <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center text-2xl">
                {icon}
            </div>
            <div>
                <p className="text-[var(--text-muted)] text-sm">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
                {subLabel && <p className="text-xs text-[var(--text-muted)]">{subLabel}</p>}
            </div>
        </div>
    </div>
)

export default function StatisticsPage() {
    const [activeTab, setActiveTab] = useState<TabType>('overview')
    const [statistics, setStatistics] = useState<SystemStatistics | null>(null)
    const [loginLogs, setLoginLogs] = useState<LoginLog[]>([])
    const [tokenUsageLogs, setTokenUsageLogs] = useState<TokenUsageLog[]>([])
    const [isLoading, setIsLoading] = useState(true)

    const supabase = createClient()

    const fetchStatistics = useCallback(async () => {
        // 获取用户统计
        const { data: users } = await supabase
            .from('user_profiles')
            .select('role, is_active')

        // 获取 Token 统计
        const { data: tokens } = await supabase
            .from('tokens')
            .select('is_active')

        // 获取分享统计
        const { count: sharesCount } = await supabase
            .from('token_shares')
            .select('*', { count: 'exact', head: true })

        // 获取登录统计
        const now = new Date()
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
        const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

        const { count: todayLogins } = await supabase
            .from('login_logs')
            .select('*', { count: 'exact', head: true })
            .gte('login_at', todayStart)

        const { count: weekLogins } = await supabase
            .from('login_logs')
            .select('*', { count: 'exact', head: true })
            .gte('login_at', weekStart)

        const { count: monthLogins } = await supabase
            .from('login_logs')
            .select('*', { count: 'exact', head: true })
            .gte('login_at', monthStart)

        const userList = users || []
        const tokenList = tokens || []

        setStatistics({
            totalUsers: userList.length,
            activeUsers: userList.filter((u) => u.is_active).length,
            inactiveUsers: userList.filter((u) => !u.is_active).length,
            adminUsers: userList.filter((u) => u.role === 'admin').length,
            totalTokens: tokenList.length,
            activeTokens: tokenList.filter((t) => t.is_active).length,
            totalShares: sharesCount || 0,
            todayLogins: todayLogins || 0,
            weekLogins: weekLogins || 0,
            monthLogins: monthLogins || 0,
        })
    }, [supabase])

    const fetchLoginLogs = useCallback(async () => {
        const { data } = await supabase
            .from('login_logs')
            .select(`
                *,
                user_profiles (id, email, display_name)
            `)
            .order('login_at', { ascending: false })
            .limit(50)

        setLoginLogs(data || [])
    }, [supabase])

    const fetchTokenUsageLogs = useCallback(async () => {
        const { data } = await supabase
            .from('token_usage_logs')
            .select(`
                *,
                user_profiles (id, email, display_name),
                tokens (id, name)
            `)
            .order('created_at', { ascending: false })
            .limit(50)

        setTokenUsageLogs(data || [])
    }, [supabase])

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true)
            await Promise.all([
                fetchStatistics(),
                fetchLoginLogs(),
                fetchTokenUsageLogs(),
            ])
            setIsLoading(false)
        }
        loadData()
    }, [fetchStatistics, fetchLoginLogs, fetchTokenUsageLogs])

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    const actionLabels: Record<string, string> = {
        create: '创建',
        update: '更新',
        delete: '删除',
        use: '使用',
        share: '分享',
    }

    if (isLoading) {
        return (
            <div className="max-w-6xl">
                <div className="p-8 text-center">
                    <div className="spinner mx-auto mb-4" />
                    <p className="text-[var(--text-muted)]">加载统计数据...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-6xl">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">系统统计</h1>
                <p className="text-[var(--text-muted)]">查看系统使用情况和统计数据</p>
            </div>

            {/* Tab 切换 */}
            <div className="flex gap-2 mb-6">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-4 py-2 rounded-lg ${activeTab === 'overview' ? 'gradient-primary text-white' : 'bg-gray-100'}`}
                >
                    📊 概览
                </button>
                <button
                    onClick={() => setActiveTab('logins')}
                    className={`px-4 py-2 rounded-lg ${activeTab === 'logins' ? 'gradient-primary text-white' : 'bg-gray-100'}`}
                >
                    🔐 登录记录
                </button>
                <button
                    onClick={() => setActiveTab('tokenUsage')}
                    className={`px-4 py-2 rounded-lg ${activeTab === 'tokenUsage' ? 'gradient-primary text-white' : 'bg-gray-100'}`}
                >
                    🎫 Token 操作
                </button>
            </div>

            {/* 概览面板 */}
            {activeTab === 'overview' && statistics && (
                <div className="space-y-6">
                    {/* 用户统计 */}
                    <div>
                        <h2 className="text-lg font-semibold mb-4">👥 用户统计</h2>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <StatCard icon="👤" label="总用户数" value={statistics.totalUsers} />
                            <StatCard icon="✅" label="已激活" value={statistics.activeUsers} />
                            <StatCard icon="⏳" label="待激活" value={statistics.inactiveUsers} />
                            <StatCard icon="👑" label="管理员" value={statistics.adminUsers} />
                        </div>
                    </div>

                    {/* Token 统计 */}
                    <div>
                        <h2 className="text-lg font-semibold mb-4">🎫 Token 统计</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <StatCard icon="📦" label="总 Token 数" value={statistics.totalTokens} />
                            <StatCard icon="🟢" label="活跃 Token" value={statistics.activeTokens} />
                            <StatCard icon="🔗" label="分享数" value={statistics.totalShares} />
                        </div>
                    </div>

                    {/* 登录统计 */}
                    <div>
                        <h2 className="text-lg font-semibold mb-4">🔐 登录统计</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <StatCard icon="📅" label="今日登录" value={statistics.todayLogins} />
                            <StatCard icon="📆" label="近7天登录" value={statistics.weekLogins} />
                            <StatCard icon="🗓️" label="近30天登录" value={statistics.monthLogins} />
                        </div>
                    </div>
                </div>
            )}

            {/* 登录记录表格 */}
            {activeTab === 'logins' && (
                <div className="card">
                    <div className="p-4 border-b border-[var(--border)]">
                        <h2 className="font-semibold">最近登录记录</h2>
                        <p className="text-sm text-[var(--text-muted)]">显示最近50条登录记录</p>
                    </div>
                    {loginLogs.length === 0 ? (
                        <div className="p-8 text-center">
                            <div className="text-4xl mb-4">🔐</div>
                            <p className="text-[var(--text-muted)]">暂无登录记录</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-[var(--border)]">
                                        <th className="text-left p-4 font-medium text-[var(--text-muted)]">用户</th>
                                        <th className="text-left p-4 font-medium text-[var(--text-muted)]">登录时间</th>
                                        <th className="text-left p-4 font-medium text-[var(--text-muted)]">IP 地址</th>
                                        <th className="text-left p-4 font-medium text-[var(--text-muted)]">客户端</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loginLogs.map((log) => (
                                        <tr key={log.id} className="border-b border-[var(--border)] last:border-0 hover:bg-gray-50">
                                            <td className="p-4">
                                                <div>
                                                    <p className="font-medium">{log.user_profiles?.display_name || '未知'}</p>
                                                    <p className="text-sm text-[var(--text-muted)]">{log.user_profiles?.email}</p>
                                                </div>
                                            </td>
                                            <td className="p-4 text-[var(--text-muted)]">{formatDate(log.login_at)}</td>
                                            <td className="p-4 text-[var(--text-muted)]">{log.ip_address || '-'}</td>
                                            <td className="p-4 text-[var(--text-muted)] max-w-xs truncate" title={log.user_agent || ''}>
                                                {log.user_agent ? log.user_agent.substring(0, 50) + '...' : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Token 操作记录表格 */}
            {activeTab === 'tokenUsage' && (
                <div className="card">
                    <div className="p-4 border-b border-[var(--border)]">
                        <h2 className="font-semibold">Token 操作记录</h2>
                        <p className="text-sm text-[var(--text-muted)]">显示最近50条 Token 操作记录</p>
                    </div>
                    {tokenUsageLogs.length === 0 ? (
                        <div className="p-8 text-center">
                            <div className="text-4xl mb-4">🎫</div>
                            <p className="text-[var(--text-muted)]">暂无 Token 操作记录</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-[var(--border)]">
                                        <th className="text-left p-4 font-medium text-[var(--text-muted)]">用户</th>
                                        <th className="text-left p-4 font-medium text-[var(--text-muted)]">操作</th>
                                        <th className="text-left p-4 font-medium text-[var(--text-muted)]">Token</th>
                                        <th className="text-left p-4 font-medium text-[var(--text-muted)]">时间</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tokenUsageLogs.map((log) => (
                                        <tr key={log.id} className="border-b border-[var(--border)] last:border-0 hover:bg-gray-50">
                                            <td className="p-4">
                                                <div>
                                                    <p className="font-medium">{log.user_profiles?.display_name || '未知'}</p>
                                                    <p className="text-sm text-[var(--text-muted)]">{log.user_profiles?.email}</p>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className={`badge ${log.action === 'create' ? 'badge-success' :
                                                    log.action === 'delete' ? 'badge-danger' :
                                                        log.action === 'share' ? 'badge-warning' : ''
                                                    }`}>
                                                    {actionLabels[log.action] || log.action}
                                                </span>
                                            </td>
                                            <td className="p-4 text-[var(--text-muted)]">
                                                {log.tokens?.name || (log.token_id ? '已删除' : '-')}
                                            </td>
                                            <td className="p-4 text-[var(--text-muted)]">{formatDate(log.created_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
