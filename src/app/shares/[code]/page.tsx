'use client'

import { useEffect, useState, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Token, TokenShare } from '@/types'

export default function ShareAccessPage({ params }: { params: Promise<{ code: string }> }) {
    const { code } = use(params)
    const [share, setShare] = useState<TokenShare | null>(null)
    const [token, setToken] = useState<Token | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')

    const supabase = createClient()

    useEffect(() => {
        const fetchShare = async () => {
            const { data, error } = await supabase
                .from('token_shares')
                .select('*, token:tokens(*)')
                .eq('share_code', code)
                .eq('is_active', true)
                .single()

            if (error || !data) {
                setError('分享链接无效或已过期')
            } else {
                // 检查是否过期
                if (data.expires_at && new Date(data.expires_at) < new Date()) {
                    setError('分享链接已过期')
                } else {
                    setShare(data as TokenShare)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    setToken((data as any).token as Token)
                }
            }
            setIsLoading(false)
        }

        fetchShare()
    }, [code, supabase])

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="spinner mx-auto mb-4" />
                    <p className="text-[var(--text-muted)]">加载中...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="card p-8 w-full max-w-md text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl">❌</span>
                    </div>
                    <h1 className="text-2xl font-bold mb-4">访问失败</h1>
                    <p className="text-[var(--text-muted)]">{error}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen p-8">
            {/* 头部 */}
            <header className="header mb-8 rounded-lg">
                <div className="flex items-center gap-4">
                    <span className="text-xl font-bold">🔐 WPS Token 分享</span>
                </div>
            </header>

            <div className="max-w-2xl mx-auto">
                <div className="card p-8">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center text-3xl">
                            🔑
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold">{token?.name}</h1>
                            <p className="text-[var(--text-muted)]">
                                权限: {share?.permission === 'use' ? '可使用' : '仅查看'}
                            </p>
                        </div>
                    </div>

                    {token?.description && (
                        <div className="mb-6">
                            <h2 className="font-medium mb-2">描述</h2>
                            <p className="text-[var(--text-muted)]">{token.description}</p>
                        </div>
                    )}

                    {token?.webhook_url && (
                        <div className="mb-6">
                            <h2 className="font-medium mb-2">Webhook URL</h2>
                            <code className="block bg-gray-100 p-3 rounded-lg text-sm break-all">
                                {token.webhook_url}
                            </code>
                        </div>
                    )}

                    {share?.permission === 'use' && token?.token_value && (
                        <div className="mb-6">
                            <h2 className="font-medium mb-2">Token 值</h2>
                            <code className="block bg-gray-100 p-3 rounded-lg text-sm break-all max-h-40 overflow-auto">
                                {token.token_value}
                            </code>
                        </div>
                    )}

                    {share?.permission === 'view' && (
                        <div className="alert alert-info">
                            此分享仅为查看权限，Token 值已隐藏。
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
