'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SearchPreset, CreatePresetInput, UpdatePresetInput } from '@/types'

export function useSearchPresets() {
    const [presets, setPresets] = useState<SearchPreset[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const supabase = createClient()

    // 获取指定 Token 的所有预设
    const fetchPresets = useCallback(async (tokenId: string) => {
        if (!tokenId) {
            setPresets([])
            return
        }

        setIsLoading(true)
        setError(null)

        try {
            const { data, error } = await supabase
                .from('search_presets')
                .select('*')
                .eq('token_id', tokenId)
                .order('created_at', { ascending: false })

            if (error) throw error
            setPresets(data || [])
        } catch (err) {
            setError(err instanceof Error ? err.message : '获取预设失败')
            setPresets([])
        } finally {
            setIsLoading(false)
        }
    }, [supabase])

    // 创建新预设
    const createPreset = useCallback(async (input: CreatePresetInput) => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('未登录')

            const { data, error } = await supabase
                .from('search_presets')
                .insert({
                    user_id: user.id,
                    token_id: input.token_id,
                    name: input.name,
                    selected_table_names: input.selected_table_names,
                    columns_data: input.columns_data,
                    selected_columns: input.selected_columns,
                    column_configs: input.column_configs,
                })
                .select()
                .single()

            if (error) throw error
            setPresets(prev => [data, ...prev])
            return { data, error: null }
        } catch (err) {
            return { data: null, error: err instanceof Error ? err.message : '创建预设失败' }
        }
    }, [supabase])

    // 更新预设
    const updatePreset = useCallback(async (id: string, input: UpdatePresetInput) => {
        try {
            const { data, error } = await supabase
                .from('search_presets')
                .update({
                    ...input,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select()
                .single()

            if (error) throw error
            setPresets(prev => prev.map(p => p.id === id ? data : p))
            return { data, error: null }
        } catch (err) {
            return { data: null, error: err instanceof Error ? err.message : '更新预设失败' }
        }
    }, [supabase])

    // 删除预设
    const deletePreset = useCallback(async (id: string) => {
        try {
            const { error } = await supabase
                .from('search_presets')
                .delete()
                .eq('id', id)

            if (error) throw error
            setPresets(prev => prev.filter(p => p.id !== id))
            return { error: null }
        } catch (err) {
            return { error: err instanceof Error ? err.message : '删除预设失败' }
        }
    }, [supabase])

    // 清空预设列表（用于切换 Token 时）
    const clearPresets = useCallback(() => {
        setPresets([])
        setError(null)
    }, [])

    return {
        presets,
        isLoading,
        error,
        fetchPresets,
        createPreset,
        updatePreset,
        deletePreset,
        clearPresets
    }
}
