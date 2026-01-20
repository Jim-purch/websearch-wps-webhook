'use client'

import { useState, useMemo } from 'react'
import type { SearchCondition } from '@/hooks/usePartSearch'

interface SearchFormProps {
    selectedColumns: Record<string, string[]>
    isSearching: boolean
    onSearch: (conditions: SearchCondition[]) => void
}

interface InputState {
    value: string
    op: 'Contains' | 'Equals'
}

export function SearchForm({ selectedColumns, isSearching, onSearch }: SearchFormProps) {
    // 为每个 table+column 组合生成输入状态
    const inputKeys = useMemo(() => {
        const keys: Array<{ tableName: string; columnName: string }> = []
        for (const [tableName, columns] of Object.entries(selectedColumns)) {
            for (const columnName of columns) {
                keys.push({ tableName, columnName })
            }
        }
        return keys
    }, [selectedColumns])

    const [inputs, setInputs] = useState<Record<string, InputState>>({})

    const handleInputChange = (key: string, value: string) => {
        setInputs(prev => ({
            ...prev,
            [key]: { ...prev[key], value, op: prev[key]?.op || 'Contains' }
        }))
    }

    const handleOpChange = (key: string, op: 'Contains' | 'Equals') => {
        setInputs(prev => ({
            ...prev,
            [key]: { ...prev[key], op, value: prev[key]?.value || '' }
        }))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        const conditions: SearchCondition[] = inputKeys
            .map(({ tableName, columnName }) => {
                const key = `${tableName}__${columnName}`
                const input = inputs[key]
                return {
                    tableName,
                    columnName,
                    searchValue: input?.value || '',
                    op: input?.op || 'Contains'
                }
            })
            .filter(c => c.searchValue.trim() !== '')

        onSearch(conditions)
    }

    if (inputKeys.length === 0) {
        return null
    }

    return (
        <div className="card p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="text-xl">🔍</span>
                步骤 4: 搜索条件
            </h3>

            <form onSubmit={handleSubmit}>
                <div className="space-y-4 mb-6">
                    {Object.entries(selectedColumns).map(([tableName, columns]) => {
                        if (columns.length === 0) return null

                        return (
                            <div
                                key={tableName}
                                className="rounded-lg border border-[var(--border)] overflow-hidden"
                            >
                                <div className="bg-[rgba(234,179,8,0.1)] px-4 py-2 border-b border-[var(--border)]">
                                    <span className="text-[#eab308] font-medium flex items-center gap-2">
                                        <span>📊</span>
                                        {tableName}
                                    </span>
                                </div>
                                <div className="p-4 bg-[var(--card-bg)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                                    {columns.map((columnName) => {
                                        const key = `${tableName}__${columnName}`
                                        const input = inputs[key] || { value: '', op: 'Contains' }
                                        const isExact = input.op === 'Equals'

                                        return (
                                            <div
                                                key={key}
                                                className="flex flex-col gap-1.5"
                                            >
                                                <div
                                                    onClick={() => handleOpChange(key, isExact ? 'Contains' : 'Equals')}
                                                    className="cursor-pointer flex items-center gap-2 select-none group w-fit"
                                                    title="点击切换模糊/精确搜索"
                                                >
                                                    <span className={`
                                                        text-sm font-medium transition-colors
                                                        ${isExact
                                                            ? 'text-[#667eea] font-bold'
                                                            : 'text-[var(--text-muted)] group-hover:text-[var(--foreground)]'
                                                        }
                                                    `}>
                                                        {columnName}
                                                    </span>
                                                    <span className={`
                                                        text-[10px] px-1.5 py-0.5 rounded border transition-all
                                                        ${isExact
                                                            ? 'bg-[rgba(102,126,234,0.1)] text-[#667eea] border-[#667eea]'
                                                            : 'bg-transparent text-[var(--text-muted)] border-[var(--border)]'
                                                        }
                                                    `}>
                                                        {isExact ? '精确' : '模糊'}
                                                    </span>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={input.value}
                                                    onChange={(e) => handleInputChange(key, e.target.value)}
                                                    placeholder="输入搜索关键字..."
                                                    className="input w-full"
                                                />
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div className="text-center">
                    <button
                        type="submit"
                        disabled={isSearching}
                        className="btn-primary px-4 py-2 text-sm w-full sm:w-auto"
                    >
                        {isSearching ? (
                            <span className="flex items-center gap-2 justify-center">
                                <span className="spinner w-4 h-4"></span>
                                搜索中...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2 justify-center">
                                <span>🔍</span>
                                执行搜索
                            </span>
                        )}
                    </button>
                </div>
            </form>
        </div>
    )
}
