'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Token, TokenShare } from '@/types'

export interface SharedTokenWithInfo extends TokenShare {
    token: Token
    sharer_email?: string
}

export function useSharedTokens() {
    const [sharedTokens, setSharedTokens] = useState<SharedTokenWithInfo[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const supabase = createClient()

    // 获取用户接收的分享Token
    const fetchSharedTokens = useCallback(async () => {
        setIsLoading(true)
        setError(null)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                setSharedTokens([])
                return
            }

            const { data, error } = await supabase
                .from('token_shares')
                .select(`
                    *,
                    token:tokens(*),
                    sharer:user_profiles!token_shares_shared_by_fkey(email)
                `)
                .eq('shared_with', user.id)
                .eq('is_active', true)
                .order('created_at', { ascending: false })

            if (error) throw error

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mapped = (data || []).map((item: any) => ({
                ...item,
                token: item.token as Token,
                sharer_email: item.sharer?.email
            })) as SharedTokenWithInfo[]

            setSharedTokens(mapped)
        } catch (err) {
            setError(err instanceof Error ? err.message : '获取分享Token失败')
        } finally {
            setIsLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        fetchSharedTokens()
    }, [fetchSharedTokens])

    // 通过分享码领取分享
    const claimShare = async (shareCode: string) => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                return { success: false, error: '请先登录' }
            }

            const { data, error } = await supabase.rpc('claim_shared_token', {
                code: shareCode
            })

            if (error) throw error

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = data as any

            if (!result.success) {
                return { success: false, error: result.error }
            }

            // 刷新列表
            await fetchSharedTokens()

            return {
                success: true,
                tokenName: result.token_name
            }
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : '领取失败'
            }
        }
    }

    // 取消接收的分享（删除分享记录）
    const removeSharedToken = async (shareId: string) => {
        try {
            const { error } = await supabase
                .from('token_shares')
                .delete()
                .eq('id', shareId)

            if (error) throw error

            setSharedTokens(prev => prev.filter(s => s.id !== shareId))
            return { success: true }
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : '操作失败'
            }
        }
    }

    // 获取可用于使用的分享Token（权限为 'use' 且 token 为激活状态）
    const getUsableSharedTokens = useCallback(() => {
        return sharedTokens.filter(
            s => s.permission === 'use' && s.token?.is_active
        )
    }, [sharedTokens])

    return {
        sharedTokens,
        isLoading,
        error,
        fetchSharedTokens,
        claimShare,
        removeSharedToken,
        getUsableSharedTokens,
    }
}
