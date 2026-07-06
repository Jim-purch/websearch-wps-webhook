'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTokens } from '@/hooks/useTokens'
import { useSharedTokens } from '@/hooks/useSharedTokens'
import { usePresetShares } from '@/hooks/usePresetShares'
import { useSearchPresets } from '@/hooks/useSearchPresets'
import type { TokenShare, CreateShareInput, Token, UserProfile } from '@/types'

export default function SharesPage() {
    const { tokens } = useTokens()
    const { sharedTokens, isLoading: isLoadingShared, claimShare, removeSharedToken } = useSharedTokens()
    const [shares, setShares] = useState<(TokenShare & { token?: Token; recipient?: Pick<UserProfile, 'display_name' | 'email'> })[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [showNewForm, setShowNewForm] = useState(false)
    const [showClaimForm, setShowClaimForm] = useState(false)
    const [newShare, setNewShare] = useState<CreateShareInput>({
        token_id: '',
        permission: 'use',
    })
    const [claimCode, setClaimCode] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isClaiming, setIsClaiming] = useState(false)
    const [error, setError] = useState('')
    const [claimError, setClaimError] = useState('')
    const [claimSuccess, setClaimSuccess] = useState('')

    // 预设分享相关状态与 Hook
    const {
        createdShares: presetCreatedShares,
        receivedShares: presetReceivedShares,
        isLoading: isLoadingPresetShares,
        error: presetError,
        fetchCreatedShares: fetchPresetCreatedShares,
        fetchReceivedShares: fetchPresetReceivedShares,
        createPresetShare,
        claimPresetShare,
        deletePresetShare,
        togglePresetShareActive
    } = usePresetShares()

    const { presets, fetchPresets } = useSearchPresets()
    const [activeTab, setActiveTab] = useState<'tokens' | 'presets'>('tokens')
    const [selectedPresetId, setSelectedPresetId] = useState('')
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)

    const supabase = createClient()

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) {
                setCurrentUserId(user.id)
            }
        })
    }, [supabase])

    const fetchShares = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data } = await supabase
            .from('token_shares')
            .select(`
                *,
                token:tokens(*),
                recipient:user_profiles!token_shares_shared_with_fkey(display_name, email)
            `)
            .eq('shared_by', user.id)
            .order('created_at', { ascending: false })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setShares((data || []).map((s: any) => ({
            ...s,
            token: s.token as Token,
            recipient: s.recipient as Pick<UserProfile, 'display_name' | 'email'> | undefined
        })))
        setIsLoading(false)
    }, [supabase])

    useEffect(() => {
        fetchShares()
    }, [fetchShares])

    // 当切换到预设 Tab 时，加载数据
    useEffect(() => {
        if (activeTab === 'presets') {
            fetchPresetCreatedShares()
            fetchPresetReceivedShares()
            fetchPresets()
        }
    }, [activeTab, fetchPresetCreatedShares, fetchPresetReceivedShares, fetchPresets])

    const ownPresets = presets.filter(p => p.user_id === currentUserId)

    const handleCreateTokenShare = async () => {
        if (!newShare.token_id) {
            setError('请选择要分享的 Token')
            return
        }

        setIsSubmitting(true)
        setError('')

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

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
            setNewShare({ token_id: '', permission: 'use' })
            fetchShares()
        }
        setIsSubmitting(false)
    }

    const handleCreatePresetShare = async () => {
        if (!selectedPresetId) {
            setError('请选择要分享的搜索预设')
            return
        }

        setIsSubmitting(true)
        setError('')

        const result = await createPresetShare(selectedPresetId)

        if (result.success) {
            setShowNewForm(false)
            setSelectedPresetId('')
        } else {
            setError(result.error || '创建分享失败')
        }
        setIsSubmitting(false)
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        if (activeTab === 'presets') {
            await handleCreatePresetShare()
        } else {
            await handleCreateTokenShare()
        }
    }

    const handleClaimTokenShare = async () => {
        const result = await claimShare(claimCode.trim())

        if (result.success) {
            setClaimSuccess(`成功领取 Token: ${result.tokenName}`)
            setClaimCode('')
            setTimeout(() => {
                setShowClaimForm(false)
                setClaimSuccess('')
            }, 2000)
        } else {
            setClaimError(result.error || '领取失败')
        }
    }

    const handleClaimPresetShare = async () => {
        const result = await claimPresetShare(claimCode.trim())

        if (result.success) {
            setClaimSuccess(`成功领取搜索预设: ${result.presetName}`)
            setClaimCode('')
            setTimeout(() => {
                setShowClaimForm(false)
                setClaimSuccess('')
            }, 2000)
        } else {
            setClaimError(result.error || '领取失败')
        }
    }

    const handleClaim = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!claimCode.trim()) {
            setClaimError('请输入分享码')
            return
        }

        setIsClaiming(true)
        setClaimError('')
        setClaimSuccess('')

        if (activeTab === 'presets') {
            await handleClaimPresetShare()
        } else {
            await handleClaimTokenShare()
        }

        setIsClaiming(false)
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

    const handleRemoveShared = async (shareId: string) => {
        const result = await removeSharedToken(shareId)
        if (!result.success) {
            alert(result.error || '操作失败')
        }
    }

    const copyShareLink = (shareCode: string) => {
        const link = `${window.location.origin}/shares/${shareCode}`
        navigator.clipboard.writeText(link)
        alert('分享链接已复制！')
    }

    const copyShareCode = (shareCode: string) => {
        navigator.clipboard.writeText(shareCode)
        alert('分享码已复制！')
    }

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">分享管理</h1>
                    <p className="text-[var(--text-muted)]">管理您的 Token 分享和搜索预设分享</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => setShowClaimForm(true)} className="btn-secondary flex items-center gap-2">
                        <span>📥</span> 添加分享码
                    </button>
                    <button onClick={() => setShowNewForm(true)} className="btn-primary flex items-center gap-2">
                        <span>🔗</span> 新建分享
                    </button>
                </div>
            </div>

            {/* Tab 切换 */}
            <div className="flex border-b border-[var(--border)] mb-6">
                <button
                    onClick={() => { setActiveTab('tokens'); setShowNewForm(false); setShowClaimForm(false); setError(''); setClaimError(''); setClaimSuccess(''); }}
                    className={`py-3 px-6 font-medium text-sm border-b-2 transition-all ${
                        activeTab === 'tokens'
                            ? 'border-[#10b981] text-[#10b981]'
                            : 'border-transparent text-[var(--text-muted)] hover:text-[var(--foreground)]'
                    }`}
                >
                    🔑 Token 分享
                </button>
                <button
                    onClick={() => { setActiveTab('presets'); setShowNewForm(false); setShowClaimForm(false); setError(''); setClaimError(''); setClaimSuccess(''); }}
                    className={`py-3 px-6 font-medium text-sm border-b-2 transition-all ${
                        activeTab === 'presets'
                            ? 'border-[#10b981] text-[#10b981]'
                            : 'border-transparent text-[var(--text-muted)] hover:text-[var(--foreground)]'
                    }`}
                >
                    📋 搜索预设分享
                </button>
            </div>

            {/* 领取分享码表单 */}
            {showClaimForm && (
                <div className="card p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4">添加分享码 ({activeTab === 'presets' ? '搜索预设' : 'Token'})</h2>
                    {claimError && <div className="alert alert-error mb-4">{claimError}</div>}
                    {claimSuccess && <div className="alert alert-success mb-4">{claimSuccess}</div>}
                    <form onSubmit={handleClaim} className="space-y-4">
                        <div>
                            <label className="label">分享码 *</label>
                            <input
                                type="text"
                                value={claimCode}
                                onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
                                className="input"
                                placeholder="输入8位分享码，如 ABC12345"
                                maxLength={10}
                                required
                            />
                            <p className="text-sm text-[var(--text-muted)] mt-1">
                                输入他人分享给您的分享码，领取后可在系统内使用该{activeTab === 'presets' ? '搜索预设' : 'Token'}
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button type="submit" disabled={isClaiming} className="btn-primary">
                                {isClaiming ? '领取中...' : '领取分享'}
                            </button>
                            <button type="button" onClick={() => { setShowClaimForm(false); setClaimError(''); setClaimSuccess(''); }} className="btn-secondary">
                                取消
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* 新建分享表单 */}
            {showNewForm && (
                <div className="card p-6 mb-6">
                    <h2 className="text-lg font-bold mb-4">创建分享链接 ({activeTab === 'presets' ? '搜索预设' : 'Token'})</h2>
                    {error && <div className="alert alert-error mb-4">{error}</div>}
                    <form onSubmit={handleCreate} className="space-y-4">
                        {activeTab === 'presets' ? (
                            <div>
                                <label className="label">选择搜索预设 *</label>
                                <select
                                    value={selectedPresetId}
                                    onChange={(e) => setSelectedPresetId(e.target.value)}
                                    className="input"
                                    required
                                >
                                    <option value="">请选择...</option>
                                    {ownPresets.map((preset) => (
                                        <option key={preset.id} value={preset.id}>{preset.name}</option>
                                    ))}
                                </select>
                            </div>
                        ) : (
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
                        )}
                        <div className="flex gap-3">
                            <button type="submit" disabled={isSubmitting} className="btn-primary">
                                {isSubmitting ? '创建中...' : '创建分享'}
                            </button>
                            <button type="button" onClick={() => { setShowNewForm(false); setError(''); }} className="btn-secondary">
                                取消
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {activeTab === 'tokens' ? (
                <>
                    {/* 已接收的 Token 分享 */}
                    <div className="card mb-6">
                        <div className="p-4 border-b border-[var(--border)]">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <span>📥</span> 已接收的 Token 分享
                            </h2>
                        </div>
                        {isLoadingShared ? (
                            <div className="p-8 text-center">
                                <div className="spinner mx-auto mb-4" />
                                <p className="text-[var(--text-muted)]">加载中...</p>
                            </div>
                        ) : sharedTokens.length === 0 ? (
                            <div className="p-8 text-center">
                                <div className="text-4xl mb-4">📭</div>
                                <p className="text-[var(--text-muted)]">暂无接收的 Token 分享</p>
                                <p className="text-sm text-[var(--text-muted)] mt-2">
                                    点击上方&quot;添加分享码&quot;按钮，输入他人的分享码来接收 Token
                                </p>
                            </div>
                        ) : (
                            <ul className="file-list">
                                {sharedTokens.map((share) => (
                                    <li key={share.id} className="file-item">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-1">
                                                <span className="text-xl">🔑</span>
                                                <span className="font-medium">{share.token?.name || '未知 Token'}</span>
                                                <span className={`badge ${share.token?.is_active ? 'badge-success' : 'badge-warning'}`}>
                                                    {share.token?.is_active ? 'Token有效' : 'Token已停用'}
                                                </span>
                                                <span className="badge badge-info">
                                                    {share.permission === 'use' ? '可使用' : '仅查看'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-[var(--text-muted)] ml-8">
                                                来自: {share.sharer_email || '未知用户'}
                                                {share.token?.description && ` · ${share.token.description}`}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleRemoveShared(share.id)}
                                                className="text-red-500 hover:text-red-600 p-2"
                                                title="移除此分享"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* 我创建的 Token 分享 */}
                    <div className="card">
                        <div className="p-4 border-b border-[var(--border)]">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <span>📤</span> 我创建的 Token 分享
                            </h2>
                        </div>
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
                                                {share.shared_with && (
                                                    <span className="badge badge-success">已被领取</span>
                                                )}
                                            </div>
                                            <p className="text-sm text-[var(--text-muted)] ml-8">
                                                分享码: <code className="bg-[var(--code-bg)] text-[var(--code-text)] px-2 py-0.5 rounded">{share.share_code}</code>
                                                {share.recipient && (
                                                    <span className="ml-3">
                                                        · 已分享给: <strong className="text-[var(--foreground)]">{share.recipient.display_name || '未设置名称'}</strong>
                                                        <span className="text-[var(--text-muted)] ml-1">({share.recipient.email})</span>
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => share.share_code && copyShareCode(share.share_code)}
                                                className="btn-secondary text-sm px-3 py-1"
                                            >
                                                复制码
                                            </button>
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
                </>
            ) : (
                <>
                    {/* 已接收的搜索预设分享 */}
                    <div className="card mb-6">
                        <div className="p-4 border-b border-[var(--border)]">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <span>📥</span> 已接收的搜索预设
                            </h2>
                        </div>
                        {isLoadingPresetShares ? (
                            <div className="p-8 text-center">
                                <div className="spinner mx-auto mb-4" />
                                <p className="text-[var(--text-muted)]">加载中...</p>
                            </div>
                        ) : presetReceivedShares.length === 0 ? (
                            <div className="p-8 text-center">
                                <div className="text-4xl mb-4">📭</div>
                                <p className="text-[var(--text-muted)]">暂无接收的搜索预设</p>
                                <p className="text-sm text-[var(--text-muted)] mt-2">
                                    点击上方&quot;添加分享码&quot;按钮，输入他人的分享码来接收预设
                                </p>
                            </div>
                        ) : (
                            <ul className="file-list">
                                {presetReceivedShares.map((share) => (
                                    <li key={share.id} className="file-item">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-1">
                                                <span className="text-xl">📋</span>
                                                <span className="font-medium">{share.preset?.name || '未知预设'}</span>
                                                <span className={`badge ${share.is_active ? 'badge-success' : 'badge-warning'}`}>
                                                    {share.is_active ? '有效' : '已失效'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-[var(--text-muted)] ml-8">
                                                来自: {share.sharer?.email || '未知用户'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => deletePresetShare(share.id, false)}
                                                className="text-red-500 hover:text-red-600 p-2"
                                                title="移除此分享"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* 我创建的搜索预设分享 */}
                    <div className="card">
                        <div className="p-4 border-b border-[var(--border)]">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <span>📤</span> 我创建的搜索预设分享
                            </h2>
                        </div>
                        {isLoadingPresetShares ? (
                            <div className="p-8 text-center">
                                <div className="spinner mx-auto mb-4" />
                                <p className="text-[var(--text-muted)]">加载中...</p>
                            </div>
                        ) : presetCreatedShares.length === 0 ? (
                            <div className="p-8 text-center">
                                <div className="text-4xl mb-4">🔗</div>
                                <p className="text-[var(--text-muted)]">暂无分享的搜索预设</p>
                            </div>
                        ) : (
                            <ul className="file-list">
                                {presetCreatedShares.map((share) => (
                                    <li key={share.id} className="file-item">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-1">
                                                <span className="text-xl">📋</span>
                                                <span className="font-medium">{share.preset?.name || '未知预设'}</span>
                                                <span className={`badge ${share.is_active ? 'badge-success' : 'badge-warning'}`}>
                                                    {share.is_active ? '有效' : '已停用'}
                                                </span>
                                                {share.shared_with && (
                                                    <span className="badge badge-success">已被领取</span>
                                                )}
                                            </div>
                                            <p className="text-sm text-[var(--text-muted)] ml-8">
                                                分享码: <code className="bg-[var(--code-bg)] text-[var(--code-text)] px-2 py-0.5 rounded">{share.share_code}</code>
                                                {share.recipient && (
                                                    <span className="ml-3">
                                                        · 已分享给: <strong className="text-[var(--foreground)]">{share.recipient.display_name || '未设置名称'}</strong>
                                                        <span className="text-[var(--text-muted)] ml-1">({share.recipient.email})</span>
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => share.share_code && copyShareCode(share.share_code)}
                                                className="btn-secondary text-sm px-3 py-1"
                                            >
                                                复制码
                                            </button>
                                            <button
                                                onClick={() => share.share_code && copyShareLink(share.share_code)}
                                                className="btn-secondary text-sm px-3 py-1"
                                            >
                                                复制链接
                                            </button>
                                            <button
                                                onClick={() => togglePresetShareActive(share.id, share.is_active)}
                                                className={`toggle ${share.is_active ? 'active' : ''}`}
                                            />
                                            <button
                                                onClick={() => deletePresetShare(share.id, true)}
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
                </>
            )}
        </div>
    )
}
