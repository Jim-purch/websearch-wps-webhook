'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { UserProfile } from '@/types'

export default function UsersPage() {
    const [users, setUsers] = useState<UserProfile[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')

    const supabase = createClient()

    const fetchUsers = useCallback(async () => {
        const { data } = await supabase
            .from('user_profiles')
            .select('*')
            .order('created_at', { ascending: false })

        setUsers(data || [])
        setIsLoading(false)
    }, [supabase])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchUsers()
    }, [fetchUsers])

    const toggleUserActive = async (userId: string, isActive: boolean) => {
        await supabase
            .from('user_profiles')
            .update({ is_active: !isActive, updated_at: new Date().toISOString() })
            .eq('id', userId)
        fetchUsers()
    }

    const toggleUserRole = async (userId: string, currentRole: string) => {
        const newRole = currentRole === 'admin' ? 'user' : 'admin'
        await supabase
            .from('user_profiles')
            .update({ role: newRole, updated_at: new Date().toISOString() })
            .eq('id', userId)
        fetchUsers()
    }

    const filteredUsers = users.filter(user => {
        if (filter === 'active') return user.is_active
        if (filter === 'inactive') return !user.is_active
        return true
    })

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    return (
        <div className="max-w-6xl">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">用户管理</h1>
                    <p className="text-[var(--text-muted)]">管理系统用户和权限</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setFilter('all')}
                        className={`px-4 py-2 rounded-lg ${filter === 'all' ? 'gradient-primary text-white' : 'bg-gray-100'}`}
                    >
                        全部 ({users.length})
                    </button>
                    <button
                        onClick={() => setFilter('active')}
                        className={`px-4 py-2 rounded-lg ${filter === 'active' ? 'gradient-primary text-white' : 'bg-gray-100'}`}
                    >
                        已激活 ({users.filter(u => u.is_active).length})
                    </button>
                    <button
                        onClick={() => setFilter('inactive')}
                        className={`px-4 py-2 rounded-lg ${filter === 'inactive' ? 'gradient-primary text-white' : 'bg-gray-100'}`}
                    >
                        待激活 ({users.filter(u => !u.is_active).length})
                    </button>
                </div>
            </div>

            <div className="card">
                {isLoading ? (
                    <div className="p-8 text-center">
                        <div className="spinner mx-auto mb-4" />
                        <p className="text-[var(--text-muted)]">加载中...</p>
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div className="p-8 text-center">
                        <div className="text-4xl mb-4">👥</div>
                        <p className="text-[var(--text-muted)]">暂无用户</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-[var(--border)]">
                                    <th className="text-left p-4 font-medium text-[var(--text-muted)]">用户</th>
                                    <th className="text-left p-4 font-medium text-[var(--text-muted)]">角色</th>
                                    <th className="text-left p-4 font-medium text-[var(--text-muted)]">状态</th>
                                    <th className="text-left p-4 font-medium text-[var(--text-muted)]">注册时间</th>
                                    <th className="text-right p-4 font-medium text-[var(--text-muted)]">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.map((user) => (
                                    <tr key={user.id} className="border-b border-[var(--border)] last:border-0 hover:bg-gray-50">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-white font-bold">
                                                    {user.display_name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium">{user.display_name || '未设置'}</p>
                                                    <p className="text-sm text-[var(--text-muted)]">{user.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`badge ${user.role === 'admin' ? 'badge-success' : ''}`}>
                                                {user.role === 'admin' ? '管理员' : '普通用户'}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <span className={`badge ${user.is_active ? 'badge-success' : 'badge-warning'}`}>
                                                {user.is_active ? '已激活' : '待激活'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-[var(--text-muted)]">
                                            {formatDate(user.created_at)}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => toggleUserActive(user.id, user.is_active)}
                                                    className={`px-3 py-1 rounded text-sm ${user.is_active
                                                        ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                                                        }`}
                                                >
                                                    {user.is_active ? '停用' : '激活'}
                                                </button>
                                                <button
                                                    onClick={() => toggleUserRole(user.id, user.role)}
                                                    className="px-3 py-1 rounded text-sm bg-purple-100 text-purple-700 hover:bg-purple-200"
                                                >
                                                    {user.role === 'admin' ? '取消管理员' : '设为管理员'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
