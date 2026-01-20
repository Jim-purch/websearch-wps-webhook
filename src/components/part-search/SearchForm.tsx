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
                <div className="space-y-3 mb-6">
                    {inputKeys.map(({ tableName, columnName }) => {
                        const key = `${tableName}__${columnName}`
                        const input = inputs[key] || { value: '', op: 'Contains' }

                        return (
                            <div
                                key={key}
                                className="flex flex-col sm:flex-row gap-2 p-3 rounded-lg bg-[var(--card-bg)] border border-[var(--border)]"
                            >
                                <div className="text-sm text-[var(--text-muted)] sm:w-48 sm:flex-shrink-0">
                                    <span className="text-[#eab308] font-medium">{tableName}</span>
                                    <span className="mx-1">→</span>
                                    <span>{columnName}</span>
                                </div>
                                <div className="flex gap-2 flex-1 items-center">
                                    <div className="flex gap-3 flex-shrink-0">
                                        <label className="flex items-center gap-1 cursor-pointer">
                                            <input
                                                type="radio"
                                                name={`op_${key}`}
                                                checked={input.op === 'Contains'}
                                                onChange={() => handleOpChange(key, 'Contains')}
                                                className="accent-[#667eea]"
                                            />
                                            <span className="text-sm">模糊</span>
                                        </label>
                                        <label className="flex items-center gap-1 cursor-pointer">
                                            <input
                                                type="radio"
                                                name={`op_${key}`}
                                                checked={input.op === 'Equals'}
                                                onChange={() => handleOpChange(key, 'Equals')}
                                                className="accent-[#667eea]"
                                            />
                                            <span className="text-sm">精确</span>
                                        </label>
                                    </div>
                                    <input
                                        type="text"
                                        value={input.value}
                                        onChange={(e) => handleInputChange(key, e.target.value)}
                                        placeholder="输入搜索值..."
                                        className="input flex-1"
                                    />
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div className="text-center">
                    <button
                        type="submit"
                        disabled={isSearching}
                        className="btn-primary px-8 py-3 text-base"
                    >
                        {isSearching ? (
                            <span className="flex items-center gap-2">
                                <span className="spinner w-4 h-4"></span>
                                搜索中...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
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
