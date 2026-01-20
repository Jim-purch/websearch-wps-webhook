'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Token, CreateTokenInput, UpdateTokenInput } from '@/types'

export function useTokens() {
    const [tokens, setTokens] = useState<Token[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const supabase = createClient()

    // 获取用户的所有 Token
    const fetchTokens = useCallback(async () => {
        setIsLoading(true)
        setError(null)

        try {
            const { data, error } = await supabase
                .from('tokens')
                .select('*')
                .order('created_at', { ascending: false })

            if (error) throw error
            setTokens(data || [])
        } catch (err) {
            setError(err instanceof Error ? err.message : '获取 Token 失败')
        } finally {
            setIsLoading(false)
        }
    }, [supabase])

    useEffect(() => {
        fetchTokens()
    }, [fetchTokens])

    // 创建 Token
    const createToken = async (input: CreateTokenInput) => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('未登录')

            const { data, error } = await supabase
                .from('tokens')
                .insert({
                    ...input,
                    user_id: user.id,
                })
                .select()
                .single()

            if (error) throw error
            setTokens(prev => [data, ...prev])
            return { data, error: null }
        } catch (err) {
            return { data: null, error: err instanceof Error ? err.message : '创建失败' }
        }
    }

    // 更新 Token
    const updateToken = async (id: string, input: UpdateTokenInput) => {
        try {
            const { data, error } = await supabase
                .from('tokens')
                .update({ ...input, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single()

            if (error) throw error
            setTokens(prev => prev.map(t => t.id === id ? data : t))
            return { data, error: null }
        } catch (err) {
            return { data: null, error: err instanceof Error ? err.message : '更新失败' }
        }
    }

    // 删除 Token
    const deleteToken = async (id: string) => {
        try {
            const { error } = await supabase
                .from('tokens')
                .delete()
                .eq('id', id)

            if (error) throw error
            setTokens(prev => prev.filter(t => t.id !== id))
            return { error: null }
        } catch (err) {
            return { error: err instanceof Error ? err.message : '删除失败' }
        }
    }

    // 切换 Token 激活状态
    const toggleTokenActive = async (id: string) => {
        const token = tokens.find(t => t.id === id)
        if (!token) return { error: '未找到 Token' }

        return updateToken(id, { is_active: !token.is_active })
    }

    return {
        tokens,
        isLoading,
        error,
        fetchTokens,
        createToken,
        updateToken,
        deleteToken,
        toggleTokenActive,
    }
}
