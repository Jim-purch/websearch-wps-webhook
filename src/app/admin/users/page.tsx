'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { UserProfile } from '@/types'

export default function UsersPage() {
    const [users, setUsers] = useState<UserProfile[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')

    // New Feature States
    const [isRegistrationOpen, setIsRegistrationOpen] = useState(true)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const [newUser, setNewUser] = useState({
        email: '',
        password: '',
        displayName: '',
        role: 'user',
        isActive: true
    })

    const supabase = createClient()

    const fetchUsers = useCallback(async () => {
        const { data } = await supabase
            .from('user_profiles')
            .select('*')
            .order('created_at', { ascending: false })

        setUsers(data || [])
        setIsLoading(false)
    }, [supabase])

    const fetchSettings = useCallback(async () => {
        const { data } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'allow_registration')
            .single()
        if (data) {
            setIsRegistrationOpen(data.value)
        }
    }, [supabase])

    useEffect(() => {
        fetchUsers()
        fetchSettings()
    }, [fetchUsers, fetchSettings])

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

    const toggleRegistration = async () => {
        const newValue = !isRegistrationOpen
        const { error } = await supabase
            .from('system_settings')
            .upsert({ key: 'allow_registration', value: newValue })

        if (!error) {
            setIsRegistrationOpen(newValue)
        } else {
            alert('更新设置失败')
        }
    }

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault()

        if (newUser.password.length < 6) {
            alert('密码至少需要6位')
            return
        }

        setIsCreating(true)
        try {
            const res = await fetch('/api/admin/users/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser)
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '创建失败')

            setShowCreateModal(false)
            setNewUser({
                email: '',
                password: '',
                displayName: '',
                role: 'user',
                isActive: true
            })
            fetchUsers()
            alert('用户创建成功')
        } catch (err: any) {
            alert(err.message)
        } finally {
            setIsCreating(false)
        }
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
            <div className="flex flex-col gap-6 mb-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">用户管理</h1>
                        <p className="text-[var(--text-muted)]">管理系统用户和权限</p>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Registration Toggle */}
                        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-[var(--border)]">
                            <span className="text-sm font-medium">开放注册</span>
                            <button
                                onClick={toggleRegistration}
                                className={`w-12 h-6 rounded-full transition-colors relative ${isRegistrationOpen ? 'bg-green-500' : 'bg-gray-300'
                                    }`}
                            >
                                <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${isRegistrationOpen ? 'left-7' : 'left-1'
                                    }`} />
                            </button>
                        </div>

                        {/* Add User Button */}
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="btn-primary flex items-center gap-2"
                        >
                            <span>➕</span> 新增用户
                        </button>
                    </div>
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

            {/* Create User Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-fade-in">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold">新增用户</h2>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleCreateUser} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">邮箱 *</label>
                                <input
                                    type="email"
                                    required
                                    className="input w-full"
                                    value={newUser.email}
                                    onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">显示名称</label>
                                <input
                                    type="text"
                                    className="input w-full"
                                    value={newUser.displayName}
                                    onChange={e => setNewUser({ ...newUser, displayName: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1">密码 *</label>
                                <input
                                    type="password"
                                    required
                                    minLength={6}
                                    className="input w-full"
                                    value={newUser.password}
                                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                    placeholder="至少6位"
                                />
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-sm font-medium mb-1">角色</label>
                                    <select
                                        className="input w-full"
                                        value={newUser.role}
                                        onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                                    >
                                        <option value="user">普通用户</option>
                                        <option value="admin">管理员</option>
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-sm font-medium mb-1">状态</label>
                                    <select
                                        className="input w-full"
                                        value={newUser.isActive ? 'true' : 'false'}
                                        onChange={e => setNewUser({ ...newUser, isActive: e.target.value === 'true' })}
                                    >
                                        <option value="true">已激活</option>
                                        <option value="false">待激活</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200"
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    disabled={isCreating}
                                    className="btn-primary"
                                >
                                    {isCreating ? '创建中...' : '确认创建'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
