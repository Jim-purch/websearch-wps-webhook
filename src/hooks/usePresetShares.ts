'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SearchPreset } from '@/types'

export interface PresetShare {
    id: string
    preset_id: string
    shared_by: string
    shared_with: string | null
    share_code: string | null
    is_active: boolean
    expires_at: string | null
    created_at: string
    preset?: SearchPreset
    recipient?: {
        display_name: string | null
        email: string
    }
    sharer?: {
        display_name: string | null
        email: string
    }
}

export function usePresetShares() {
    const [createdShares, setCreatedShares] = useState<PresetShare[]>([])
    const [receivedShares, setReceivedShares] = useState<PresetShare[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const supabase = createClient()

    const fetchCreatedShares = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data, error } = await supabase
                .from('preset_shares')
                .select(`
                    *,
                    preset:search_presets(*),
                    recipient:user_profiles!preset_shares_shared_with_fkey(display_name, email)
                `)
                .eq('shared_by', user.id)
                .order('created_at', { ascending: false })

            if (error) throw error
            setCreatedShares((data || []) as PresetShare[])
        } catch (err) {
            setError(err instanceof Error ? err.message : '获取分享列表失败')
        } finally {
            setIsLoading(false)
        }
    }, [supabase])

    const fetchReceivedShares = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data, error } = await supabase
                .from('preset_shares')
                .select(`
                    *,
                    preset:search_presets(*),
                    sharer:user_profiles!preset_shares_shared_by_fkey(display_name, email)
                `)
                .eq('shared_with', user.id)
                .eq('is_active', true)
                .order('created_at', { ascending: false })

            if (error) throw error
            setReceivedShares((data || []) as PresetShare[])
        } catch (err) {
            setError(err instanceof Error ? err.message : '获取接收列表失败')
        } finally {
            setIsLoading(false)
        }
    }, [supabase])

    const createPresetShare = async (presetId: string) => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('请先登录')

            const shareCode = Math.random().toString(36).substring(2, 10).toUpperCase()

            const { data, error } = await supabase
                .from('preset_shares')
                .insert({
                    preset_id: presetId,
                    shared_by: user.id,
                    share_code: shareCode,
                    is_active: true
                })
                .select()
                .single()

            if (error) throw error
            await fetchCreatedShares()
            return { success: true, data }
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : '创建分享失败' }
        }
    }

    const claimPresetShare = async (code: string) => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                return { success: false, error: '请先登录' }
            }

            const { data, error } = await supabase.rpc('claim_shared_preset', {
                code
            })

            if (error) throw error

            const result = data as any
            if (!result.success) {
                return { success: false, error: result.error }
            }

            await fetchReceivedShares()
            return { success: true, presetName: result.preset_name }
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : '领取失败' }
        }
    }

    const deletePresetShare = async (id: string, isCreated: boolean) => {
        try {
            const { error } = await supabase
                .from('preset_shares')
                .delete()
                .eq('id', id)

            if (error) throw error

            if (isCreated) {
                setCreatedShares(prev => prev.filter(s => s.id !== id))
            } else {
                setReceivedShares(prev => prev.filter(s => s.id !== id))
            }
            return { success: true }
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : '删除失败' }
        }
    }

    const togglePresetShareActive = async (id: string, currentActive: boolean) => {
        try {
            const { error } = await supabase
                .from('preset_shares')
                .update({ is_active: !currentActive })
                .eq('id', id)

            if (error) throw error
            setCreatedShares(prev =>
                prev.map(s => s.id === id ? { ...s, is_active: !currentActive } : s)
            )
            return { success: true }
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : '更新状态失败' }
        }
    }

    return {
        createdShares,
        receivedShares,
        isLoading,
        error,
        fetchCreatedShares,
        fetchReceivedShares,
        createPresetShare,
        claimPresetShare,
        deletePresetShare,
        togglePresetShareActive
    }
}
