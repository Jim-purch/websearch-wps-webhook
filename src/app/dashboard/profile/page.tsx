'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { useTokens } from '@/hooks/useTokens'
import { useSharedTokens } from '@/hooks/useSharedTokens'
import type { CreateTokenInput, UpdateTokenInput } from '@/types'

export default function ProfilePage() {
    const { user, refreshUser } = useAuth()
    const [isEditingName, setIsEditingName] = useState(false)
    const [newName, setNewName] = useState('')
    const [isUpdatingName, setIsUpdatingName] = useState(false)
    const supabase = createClient()

    // Token Logic
    const { tokens, isLoading: isLoadingTokens, createToken, updateToken, deleteToken, toggleTokenActive } = useTokens()
    const { fetchSharedTokens } = useSharedTokens()
    const [showNewTokenForm, setShowNewTokenForm] = useState(false)
    const [editingToken, setEditingToken] = useState<string | null>(null)
    const [newToken, setNewToken] = useState<CreateTokenInput>({
        name: '',
        token_value: '',
        description: '',
        webhook_url: '',
    })
    const [editToken, setEditToken] = useState<UpdateTokenInput>({
        name: '',
        token_value: '',
        description: '',
        webhook_url: '',
    })
    const [isSubmittingToken, setIsSubmittingToken] = useState(false)
    const [isEditingToken, setIsEditingToken] = useState(false)
    const [tokenError, setTokenError] = useState('')
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
    const [isTokenListOpen, setIsTokenListOpen] = useState(false) // Default to closed to save space

    useEffect(() => {
        if (user?.display_name) {
            setNewName(user.display_name)
        }
    }, [user])

    const handleUpdateName = async () => {
        if (!user || !newName.trim()) return
        setIsUpdatingName(true)
        try {
            const { error } = await supabase
                .from('user_profiles')
                .update({ display_name: newName.trim(), updated_at: new Date().toISOString() })
                .eq('id', user.id)

            if (error) throw error

            await refreshUser()
            setIsEditingName(false)
        } catch (error) {
            console.error('Update name failed:', error)
            alert('更新失败，请重试')
        } finally {
            setIsUpdatingName(false)
        }
    }

    const handleCreateToken = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newToken.name || !newToken.token_value) {
            setTokenError('请填写必填字段')
            return
        }

        setIsSubmittingToken(true)
        setTokenError('')

        const { error } = await createToken(newToken)
        if (error) {
            setTokenError(error)
        } else {
            setShowNewTokenForm(false)
            setNewToken({ name: '', token_value: '', description: '', webhook_url: '' })
        }
        setIsSubmittingToken(false)
    }

    const handleEditToken = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingToken || !editToken.name) {
            setTokenError('请填写必填字段')
            return
        }

        setIsEditingToken(true)
        setTokenError('')

        const { error } = await updateToken(editingToken, editToken)
        if (error) {
            setTokenError(error)
        } else {
            setEditingToken(null)
            setEditToken({ name: '', token_value: '', description: '', webhook_url: '' })
            await fetchSharedTokens()
        }
        setIsEditingToken(false)
    }

    const startEditingToken = (tokenId: string) => {
        const token = tokens.find(t => t.id === tokenId)
        if (!token) return

        setEditingToken(tokenId)
        setEditToken({
            name: token.name,
            token_value: token.token_value,
            description: token.description || '',
            webhook_url: token.webhook_url || '',
        })
        setTokenError('')
    }

    const cancelEditingToken = () => {
        setEditingToken(null)
        setEditToken({ name: '', token_value: '', description: '', webhook_url: '' })
        setTokenError('')
    }

    const handleDeleteToken = async (id: string) => {
        await deleteToken(id)
        setDeleteConfirm(null)
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8">

            {/* User Profile Section */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <span>👤</span> 个人简档
                    </h2>
                </div>

                <div className="card p-6">
                    <div className="flex items-start gap-6">
                        <div className="w-20 h-20 rounded-full gradient-primary flex items-center justify-center text-white text-3xl font-bold shrink-0">
                            {user?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
                        </div>

                        <div className="flex-1 space-y-4">
                            <div>
                                <label className="text-sm font-medium text-[var(--text-muted)]">邮箱账号</label>
                                <p className="text-lg font-medium">{user?.email}</p>
                            </div>

                            <div>
                                <label className="text-sm font-medium text-[var(--text-muted)] block mb-1">显示名称</label>
                                {isEditingName ? (
                                    <div className="flex items-center gap-2 max-w-md">
                                        <input
                                            type="text"
                                            value={newName}
                                            onChange={(e) => setNewName(e.target.value)}
                                            className="input py-1 px-3"
                                            placeholder="您的昵称"
                                        />
                                        <button
                                            onClick={handleUpdateName}
                                            disabled={isUpdatingName}
                                            className="btn-primary py-1 px-3 text-sm"
                                        >
                                            {isUpdatingName ? '保存ing...' : '保存'}
                                        </button>
                                        <button
                                            onClick={() => { setIsEditingName(false); setNewName(user?.display_name || ''); }}
                                            className="btn-secondary py-1 px-3 text-sm"
                                        >
                                            取消
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3">
                                        <p className="text-lg">{user?.display_name || '未设置'}</p>
                                        <button
                                            onClick={() => setIsEditingName(true)}
                                            className="text-[var(--primary)] text-sm hover:underline"
                                        >
                                            修改
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="pt-2 border-t border-[var(--border)] mt-4">
                                <div className="flex gap-4 text-sm text-[var(--text-muted)]">
                                    <span>角色: <span className="font-medium text-[var(--foreground)]">{user?.role === 'admin' ? '管理员' : '普通用户'}</span></span>
                                    <span>注册时间: {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Token Management Section */}
            <section className="card overflow-hidden">
                <div
                    className="p-6 flex items-center justify-between cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
                    onClick={() => setIsTokenListOpen(!isTokenListOpen)}
                >
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🔑</span>
                        <div>
                            <h2 className="text-xl font-bold">Token 管理</h2>
                            <p className="text-sm text-[var(--text-muted)]">
                                {isLoadingTokens ? '正在加载...' : `共 ${tokens.length} 个 Token`}
                                {!isTokenListOpen && tokens.length > 0 && (
                                    <span className="ml-2">• 点击展开管理</span>
                                )}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowNewTokenForm(true);
                                setIsTokenListOpen(true);
                            }}
                            className="btn-primary flex items-center gap-2 py-1.5 px-3 text-sm h-fit"
                        >
                            <span>➕</span> 新建
                        </button>
                        <span className={`text-[var(--text-muted)] transition-transform duration-300 ${isTokenListOpen ? 'rotate-180' : ''}`}>
                            ▼
                        </span>
                    </div>
                </div>

                <div className={`transition-all duration-300 ease-in-out ${isTokenListOpen ? 'max-h-[2000px] opacity-100 border-t border-[var(--border)]' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                    <div className="p-6 pt-4">
                        {/* Create Token Form */}
                        {showNewTokenForm && (
                            <div className="bg-[var(--bg-secondary)] p-6 rounded-xl mb-6 animate-in fade-in slide-in-from-top-4 duration-300 border border-[var(--border)] shadow-sm">
                                <h3 className="text-lg font-bold mb-4">新建 Token</h3>
                                {tokenError && <div className="alert alert-error mb-4">{tokenError}</div>}
                                <form onSubmit={handleCreateToken} className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="label">名称 *</label>
                                            <input
                                                type="text"
                                                value={newToken.name}
                                                onChange={(e) => setNewToken({ ...newToken, name: e.target.value })}
                                                className="input"
                                                placeholder="Token 名称"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="label">Webhook URL</label>
                                            <input
                                                type="text"
                                                value={newToken.webhook_url || ''}
                                                onChange={(e) => setNewToken({ ...newToken, webhook_url: e.target.value })}
                                                className="input"
                                                placeholder="https://..."
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="label">Token 值 *</label>
                                        <textarea
                                            value={newToken.token_value}
                                            onChange={(e) => setNewToken({ ...newToken, token_value: e.target.value })}
                                            className="input min-h-[100px]"
                                            placeholder="粘贴您的 WPS 脚本令牌"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="label">描述</label>
                                        <input
                                            type="text"
                                            value={newToken.description || ''}
                                            onChange={(e) => setNewToken({ ...newToken, description: e.target.value })}
                                            className="input"
                                            placeholder="可选描述"
                                        />
                                    </div>
                                    <div className="flex gap-3">
                                        <button type="submit" disabled={isSubmittingToken} className="btn-primary">
                                            {isSubmittingToken ? '创建中...' : '创建'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowNewTokenForm(false)}
                                            className="btn-secondary"
                                        >
                                            取消
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* Token List */}
                        <div className="rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--bg-tertiary)]/30">
                            {isLoadingTokens ? (
                                <div className="p-12 text-center">
                                    <div className="spinner mx-auto mb-4" />
                                    <p className="text-[var(--text-muted)]">加载中...</p>
                                </div>
                            ) : tokens.length === 0 ? (
                                <div className="p-12 text-center">
                                    <div className="text-5xl mb-4">🔑</div>
                                    <p className="text-[var(--text-muted)] text-lg">暂无 Token</p>
                                    <p className="text-sm text-[var(--text-muted)] mt-1">点击右上角「新建」按钮开始添加</p>
                                </div>
                            ) : (
                                <ul className="file-list">
                                    {tokens.map((token) => (
                                        <li key={token.id} className="file-item hover:bg-[var(--hover-bg)] transition-colors">
                                            {editingToken === token.id ? (
                                                <div className="w-full p-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                                    <h4 className="font-medium mb-3">编辑 Token</h4>
                                                    {tokenError && <div className="alert alert-error mb-3">{tokenError}</div>}
                                                    <form onSubmit={handleEditToken} className="space-y-3">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                            <div>
                                                                <label className="label text-sm">名称 *</label>
                                                                <input
                                                                    type="text"
                                                                    value={editToken.name}
                                                                    onChange={(e) => setEditToken({ ...editToken, name: e.target.value })}
                                                                    className="input py-1.5 px-3 text-sm"
                                                                    required
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="label text-sm">Webhook URL</label>
                                                                <input
                                                                    type="text"
                                                                    value={editToken.webhook_url || ''}
                                                                    onChange={(e) => setEditToken({ ...editToken, webhook_url: e.target.value })}
                                                                    className="input py-1.5 px-3 text-sm"
                                                                    placeholder="https://..."
                                                                />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="label text-sm">Token 值 *</label>
                                                            <textarea
                                                                value={editToken.token_value}
                                                                onChange={(e) => setEditToken({ ...editToken, token_value: e.target.value })}
                                                                className="input min-h-[80px] py-1.5 px-3 text-sm"
                                                                required
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="label text-sm">描述</label>
                                                            <input
                                                                type="text"
                                                                value={editToken.description || ''}
                                                                onChange={(e) => setEditToken({ ...editToken, description: e.target.value })}
                                                                className="input py-1.5 px-3 text-sm"
                                                                placeholder="可选描述"
                                                            />
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button type="submit" disabled={isEditingToken} className="btn-primary text-sm py-1.5 px-3 text-white">
                                                                {isEditingToken ? '保存中...' : '保存'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={cancelEditingToken}
                                                                className="btn-secondary text-sm py-1.5 px-3"
                                                            >
                                                                取消
                                                            </button>
                                                        </div>
                                                    </form>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-3 mb-1">
                                                            <span className="text-xl">🔑</span>
                                                            <span className="font-medium">{token.name}</span>
                                                            <span className={`badge ${token.is_active ? 'badge-success' : 'badge-warning'}`}>
                                                                {token.is_active ? '活跃' : '已停用'}
                                                            </span>
                                                        </div>
                                                        {token.description && (
                                                            <p className="text-sm text-[var(--text-muted)] ml-8">{token.description}</p>
                                                        )}
                                                        {token.webhook_url && (
                                                            <p className="text-xs text-[var(--text-muted)] ml-8 mt-1 font-mono bg-[var(--background)] inline-block px-1 rounded">
                                                                🔗 {token.webhook_url}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            onClick={() => toggleTokenActive(token.id)}
                                                            className={`toggle ${token.is_active ? 'active' : ''}`}
                                                            title={token.is_active ? '停用' : '启用'}
                                                        />
                                                        <button
                                                            onClick={() => startEditingToken(token.id)}
                                                            className="p-2 text-[var(--text-muted)] hover:text-blue-500 transition-colors"
                                                            title="编辑"
                                                        >
                                                            ✏️
                                                        </button>
                                                        {deleteConfirm === token.id ? (
                                                            <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                                                                <button onClick={() => handleDeleteToken(token.id)} className="btn-danger text-xs py-1 px-2 text-white">
                                                                    确认
                                                                </button>
                                                                <button onClick={() => setDeleteConfirm(null)} className="btn-secondary text-xs py-1 px-2">
                                                                    取消
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => setDeleteConfirm(token.id)}
                                                                className="p-2 text-[var(--text-muted)] hover:text-red-500 transition-colors"
                                                                title="删除"
                                                            >
                                                                🗑️
                                                            </button>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}
