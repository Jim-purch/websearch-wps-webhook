'use client'

import { useState, useEffect } from 'react'
import type { SearchPreset } from '@/types'

type SaveMode = 'new' | 'update'

interface SavePresetModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (name: string) => Promise<{ error: string | null }>
    onUpdateConfig?: (id: string) => Promise<{ error: string | null }>
    onUpdateName?: (id: string, name: string) => Promise<{ error: string | null }>
    editingPreset?: SearchPreset | null
    existingPresets?: SearchPreset[]
    // 当前配置摘要信息
    selectedTablesCount: number
    selectedColumnsCount: number
}

export function SavePresetModal({
    isOpen,
    onClose,
    onSave,
    onUpdateConfig,
    onUpdateName,
    editingPreset,
    existingPresets = [],
    selectedTablesCount,
    selectedColumnsCount
}: SavePresetModalProps) {
    const [name, setName] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saveMode, setSaveMode] = useState<SaveMode>('new')
    const [selectedPresetId, setSelectedPresetId] = useState<string>('')

    const isEditing = !!editingPreset

    // 当编辑模式时，填充预设名称
    useEffect(() => {
        if (editingPreset) {
            setName(editingPreset.name)
            setSaveMode('new') // 编辑名称时作为新建模式
        } else {
            setName('')
            setSaveMode('new')
            setSelectedPresetId('')
        }
        setError(null)
    }, [editingPreset, isOpen])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        setIsSaving(true)
        setError(null)

        try {
            let result

            if (isEditing && editingPreset && onUpdateName) {
                // 编辑预设名称
                if (!name.trim()) {
                    setError('请输入预设名称')
                    return
                }
                result = await onUpdateName(editingPreset.id, name.trim())
            } else if (saveMode === 'update' && selectedPresetId && onUpdateConfig) {
                // 更新现有预设的配置
                result = await onUpdateConfig(selectedPresetId)
            } else {
                // 新建预设
                if (!name.trim()) {
                    setError('请输入预设名称')
                    return
                }
                result = await onSave(name.trim())
            }

            if (result.error) {
                setError(result.error)
            } else {
                onClose()
            }
        } finally {
            setIsSaving(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl p-6 w-full max-w-md"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <span>{isEditing ? '✏️' : '💾'}</span>
                        {isEditing ? '编辑预设名称' : '保存搜索预设'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors p-1"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* 保存模式选择（仅新建时显示） */}
                    {!isEditing && existingPresets.length > 0 && (
                        <div className="flex gap-2 p-1 rounded-lg bg-[var(--hover-bg)] border border-[var(--border)]">
                            <button
                                type="button"
                                onClick={() => {
                                    setSaveMode('new')
                                    setSelectedPresetId('')
                                }}
                                className={`flex-1 py-2 px-3 text-sm rounded-md transition-all ${saveMode === 'new'
                                        ? 'bg-[var(--card-bg)] text-[var(--foreground)] shadow-sm font-medium'
                                        : 'text-[var(--text-muted)] hover:text-[var(--foreground)]'
                                    }`}
                            >
                                新建预设
                            </button>
                            <button
                                type="button"
                                onClick={() => setSaveMode('update')}
                                className={`flex-1 py-2 px-3 text-sm rounded-md transition-all ${saveMode === 'update'
                                        ? 'bg-[var(--card-bg)] text-[var(--foreground)] shadow-sm font-medium'
                                        : 'text-[var(--text-muted)] hover:text-[var(--foreground)]'
                                    }`}
                            >
                                更新现有预设
                            </button>
                        </div>
                    )}

                    {/* 新建模式：预设名称输入 */}
                    {(saveMode === 'new' || isEditing) && (
                        <div>
                            <label className="block text-sm font-medium mb-2">
                                预设名称
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="例如：常用配件查询"
                                className="input w-full"
                                autoFocus
                            />
                        </div>
                    )}

                    {/* 更新模式：选择现有预设 */}
                    {saveMode === 'update' && !isEditing && (
                        <div>
                            <label className="block text-sm font-medium mb-2">
                                选择要更新的预设
                            </label>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {existingPresets.map((preset) => (
                                    <label
                                        key={preset.id}
                                        className={`
                                            flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
                                            ${selectedPresetId === preset.id
                                                ? 'border-[#10b981] bg-[#10b981]/10'
                                                : 'border-[var(--border)] hover:bg-[var(--hover-bg)]'
                                            }
                                        `}
                                    >
                                        <input
                                            type="radio"
                                            name="preset"
                                            value={preset.id}
                                            checked={selectedPresetId === preset.id}
                                            onChange={() => setSelectedPresetId(preset.id)}
                                            className="w-4 h-4 accent-[#10b981]"
                                        />
                                        <div className="flex-1">
                                            <div className="font-medium">{preset.name}</div>
                                            <div className="text-xs text-[var(--text-muted)]">
                                                创建于 {new Date(preset.created_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 配置摘要 */}
                    {!isEditing && (
                        <div className="p-4 rounded-lg bg-[var(--hover-bg)] border border-[var(--border)]">
                            <div className="text-sm font-medium mb-2 text-[var(--text-muted)]">
                                {saveMode === 'update' ? '将覆盖为当前配置' : '当前配置摘要'}
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="flex items-center gap-2">
                                    <span className="text-[#eab308]">📊</span>
                                    <span>已选表：<strong className="text-[var(--foreground)]">{selectedTablesCount}</strong> 个</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[#667eea]">📝</span>
                                    <span>搜索列：<strong className="text-[var(--foreground)]">{selectedColumnsCount}</strong> 个</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 错误提示 */}
                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm flex items-center gap-2">
                            <span>⚠️</span>
                            {error}
                        </div>
                    )}

                    {/* 按钮 */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2 px-4 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--hover-bg)] transition-colors"
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving || (saveMode === 'update' && !selectedPresetId && !isEditing)}
                            className="flex-1 py-2 px-4 rounded-lg bg-gradient-to-r from-[#10b981] to-[#34d399] text-white font-medium hover:from-[#059669] hover:to-[#10b981] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving ? (
                                <span className="flex items-center gap-2 justify-center">
                                    <span className="spinner w-4 h-4 border-white/30 border-t-white"></span>
                                    保存中...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2 justify-center">
                                    <span>{saveMode === 'update' && !isEditing ? '🔄' : '💾'}</span>
                                    {isEditing ? '更新名称' : (saveMode === 'update' ? '覆盖保存' : '保存')}
                                </span>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
