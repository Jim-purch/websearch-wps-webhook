'use client'

import { useState } from 'react'
import { useTokens } from '@/hooks/useTokens'
import type { CreateTokenInput } from '@/types'

export default function TokensPage() {
    const { tokens, isLoading, createToken, deleteToken, toggleTokenActive } = useTokens()
    const [showNewForm, setShowNewForm] = useState(false)
    const [newToken, setNewToken] = useState<CreateTokenInput>({
        name: '',
        token_value: '',
        description: '',
        webhook_url: '',
    })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState('')
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newToken.name || !newToken.token_value) {
            setError('请填写必填字段')
            return
        }

        setIsSubmitting(true)
        setError('')

        const { error } = await createToken(newToken)
        if (error) {
            setError(error)
        } else {
            setShowNewForm(false)
            setNewToken({ name: '', token_value: '', description: '', webhook_url: '' })
        }
        setIsSubmitting(false)
    }

    const handleDelete = async (id: string) => {
        await deleteToken(id)
        setDeleteConfirm(null)
    }

    return (
        <div className="max-w-6xl">
            {/* 页面标题 */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Token 管理</h1>
                    <p className="text-[var(--text-muted)]">管理您的 WPS 脚本令牌</p>
                </div>
                <button
                    onClick={() => setShowNewForm(true)}
                    className="btn-primary flex items-center gap-2"
                >
                    <span>➕</span> 新建 Token
                </button>
            </div>

            {/* 新建表单 */}
            {showNewForm && (
                <div className="card p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4">新建 Token</h2>
                    {error && <div className="alert alert-error mb-4">{error}</div>}
                    <form onSubmit={handleCreate} className="space-y-4">
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
                            <button type="submit" disabled={isSubmitting} className="btn-primary">
                                {isSubmitting ? '创建中...' : '创建'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowNewForm(false)}
                                className="btn-secondary"
                            >
                                取消
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Token 列表 */}
            <div className="card">
                {isLoading ? (
                    <div className="p-8 text-center">
                        <div className="spinner mx-auto mb-4" />
                        <p className="text-[var(--text-muted)]">加载中...</p>
                    </div>
                ) : tokens.length === 0 ? (
                    <div className="p-8 text-center">
                        <div className="text-4xl mb-4">🔑</div>
                        <p className="text-[var(--text-muted)]">暂无 Token，点击上方按钮创建</p>
                    </div>
                ) : (
                    <ul className="file-list">
                        {tokens.map((token) => (
                            <li key={token.id} className="file-item">
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
                                        <p className="text-xs text-[var(--text-muted)] ml-8 mt-1">
                                            🔗 {token.webhook_url}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => toggleTokenActive(token.id)}
                                        className={`toggle ${token.is_active ? 'active' : ''}`}
                                        title={token.is_active ? '停用' : '启用'}
                                    />
                                    {deleteConfirm === token.id ? (
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => handleDelete(token.id)} className="btn-danger text-sm">
                                                确认删除
                                            </button>
                                            <button onClick={() => setDeleteConfirm(null)} className="btn-secondary text-sm px-3 py-1">
                                                取消
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setDeleteConfirm(token.id)}
                                            className="text-red-500 hover:text-red-600 p-2"
                                            title="删除"
                                        >
                                            🗑️
                                        </button>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}
