'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTokens } from '@/hooks/useTokens'
import type { TokenShare, CreateShareInput, Token } from '@/types'

export default function SharesPage() {
    const { tokens } = useTokens()
    const [shares, setShares] = useState<(TokenShare & { token?: Token })[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [showNewForm, setShowNewForm] = useState(false)
    const [newShare, setNewShare] = useState<CreateShareInput>({
        token_id: '',
        permission: 'view',
    })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState('')

    const supabase = createClient()

    const fetchShares = useCallback(async () => {
        setIsLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data } = await supabase
            .from('token_shares')
            .select('*, token:tokens(*)')
            .eq('shared_by', user.id)
            .order('created_at', { ascending: false })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setShares((data || []).map((s: any) => ({
            ...s,
            token: s.token as Token
        })))
        setIsLoading(false)
    }, [supabase])

    useEffect(() => {
        fetchShares()
    }, [fetchShares])

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newShare.token_id) {
            setError('请选择要分享的 Token')
            return
        }

        setIsSubmitting(true)
        setError('')

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // 生成分享码
        const shareCode = Math.random().toString(36).substring(2, 10).toUpperCase()

        const { error } = await supabase
            .from('token_shares')
            .insert({
                ...newShare,
                shared_by: user.id,
                share_code: shareCode,
            })

        if (error) {
            setError(error.message)
        } else {
            setShowNewForm(false)
            setNewShare({ token_id: '', permission: 'view' })
            fetchShares()
        }
        setIsSubmitting(false)
    }

    const handleToggleActive = async (id: string, currentActive: boolean) => {
        await supabase
            .from('token_shares')
            .update({ is_active: !currentActive })
            .eq('id', id)
        fetchShares()
    }

    const handleDelete = async (id: string) => {
        await supabase
            .from('token_shares')
            .delete()
            .eq('id', id)
        fetchShares()
    }

    const copyShareLink = (shareCode: string) => {
        const link = `${window.location.origin}/shares/${shareCode}`
        navigator.clipboard.writeText(link)
        alert('分享链接已复制！')
    }

    return (
        <div className="max-w-6xl">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">分享管理</h1>
                    <p className="text-[var(--text-muted)]">管理您的 Token 分享链接</p>
                </div>
                <button onClick={() => setShowNewForm(true)} className="btn-primary flex items-center gap-2">
                    <span>🔗</span> 新建分享
                </button>
            </div>

            {showNewForm && (
                <div className="card p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4">创建分享链接</h2>
                    {error && <div className="alert alert-error mb-4">{error}</div>}
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div>
                            <label className="label">选择 Token *</label>
                            <select
                                value={newShare.token_id}
                                onChange={(e) => setNewShare({ ...newShare, token_id: e.target.value })}
                                className="input"
                                required
                            >
                                <option value="">请选择...</option>
                                {tokens.map((token) => (
                                    <option key={token.id} value={token.id}>{token.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label">权限</label>
                            <select
                                value={newShare.permission}
                                onChange={(e) => setNewShare({ ...newShare, permission: e.target.value as 'view' | 'use' })}
                                className="input"
                            >
                                <option value="view">仅查看</option>
                                <option value="use">可使用</option>
                            </select>
                        </div>
                        <div className="flex gap-3">
                            <button type="submit" disabled={isSubmitting} className="btn-primary">
                                {isSubmitting ? '创建中...' : '创建分享'}
                            </button>
                            <button type="button" onClick={() => setShowNewForm(false)} className="btn-secondary">
                                取消
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="card">
                {isLoading ? (
                    <div className="p-8 text-center">
                        <div className="spinner mx-auto mb-4" />
                        <p className="text-[var(--text-muted)]">加载中...</p>
                    </div>
                ) : shares.length === 0 ? (
                    <div className="p-8 text-center">
                        <div className="text-4xl mb-4">🔗</div>
                        <p className="text-[var(--text-muted)]">暂无分享链接</p>
                    </div>
                ) : (
                    <ul className="file-list">
                        {shares.map((share) => (
                            <li key={share.id} className="file-item">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="text-xl">🔗</span>
                                        <span className="font-medium">{share.token?.name || '未知 Token'}</span>
                                        <span className={`badge ${share.is_active ? 'badge-success' : 'badge-warning'}`}>
                                            {share.is_active ? '有效' : '已停用'}
                                        </span>
                                        <span className="badge badge-info">
                                            {share.permission === 'use' ? '可使用' : '仅查看'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-[var(--text-muted)] ml-8">
                                        分享码: <code className="bg-gray-100 px-2 py-0.5 rounded">{share.share_code}</code>
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => share.share_code && copyShareLink(share.share_code)}
                                        className="btn-secondary text-sm px-3 py-1"
                                    >
                                        复制链接
                                    </button>
                                    <button
                                        onClick={() => handleToggleActive(share.id, share.is_active)}
                                        className={`toggle ${share.is_active ? 'active' : ''}`}
                                    />
                                    <button
                                        onClick={() => handleDelete(share.id)}
                                        className="text-red-500 hover:text-red-600 p-2"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}
