'use client'

import { useState, useMemo } from 'react'
import type { SearchCondition } from '@/hooks/usePartSearch'

interface SearchFormProps {
    selectedColumns: Record<string, string[]>
    isSearching: boolean
    onSearch: (conditions: SearchCondition[]) => void
    onExport?: (conditions: SearchCondition[]) => void
    isExporting?: boolean
    autoLoadImages: boolean
    onAutoLoadImagesChange: (value: boolean) => void
    // Batch Search Props
    onDownloadTemplate?: () => void
    onBatchSearch?: (file: File) => void
    isBatchSearching?: boolean
}

interface InputState {
    value: string
    op: 'Contains' | 'Equals'
}

export function SearchForm({
    selectedColumns,
    isSearching,
    onSearch,
    onExport,
    isExporting = false,
    autoLoadImages,
    onAutoLoadImagesChange,
    onDownloadTemplate,
    onBatchSearch,
    isBatchSearching = false
}: SearchFormProps) {
    // ... existing logic ...

    // (Ensure inputKeys and inputs state logic remains unchanged)
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
    const [isOpen, setIsOpen] = useState(true)

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

    const getConditions = () => {
        return inputKeys
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
            .filter(c => c.searchValue.trim() !== '') as SearchCondition[]
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        onSearch(getConditions())
    }

    const handleExport = () => {
        if (onExport) {
            onExport(getConditions())
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file && onBatchSearch) {
            onBatchSearch(file)
            // 重置 input value 使得同一个文件可以重复上传
            e.target.value = ''
        }
    }

    if (inputKeys.length === 0) {
        return null
    }

    return (
        <div className="card">
            <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <span className="text-xl">🔍</span>
                    步骤 4: 搜索条件
                </h3>
                <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                    ▼
                </span>
            </div>

            {isOpen && (
                <div className="p-6 pt-0 border-t border-transparent">
                    <form onSubmit={handleSubmit}>
                        <div className="space-y-4 mb-6">
                            {Object.entries(selectedColumns).map(([tableKey, columns]) => {
                                if (columns.length === 0) return null

                                // 获取显示名称
                                const displayName = tableKey.includes('__copy_')
                                    ? `${tableKey.split('__copy_')[0]} (副本${tableKey.split('__copy_')[1]})`
                                    : tableKey

                                return (
                                    <div
                                        key={tableKey}
                                        className="rounded-lg border border-[var(--border)] overflow-hidden"
                                    >
                                        <div className="bg-[rgba(234,179,8,0.1)] px-4 py-2 border-b border-[var(--border)]">
                                            <span className="text-[#eab308] font-medium flex items-center gap-2">
                                                <span>📊</span>
                                                {displayName}
                                            </span>
                                        </div>
                                        <div className="p-4 bg-[var(--card-bg)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                                            {columns.map((columnName) => {
                                                const key = `${tableKey}__${columnName}`
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

                        <div className="text-center flex flex-wrap justify-center items-center gap-4">
                            {/* 自动加载图片选项 */}
                            <label
                                className="flex items-center gap-2 cursor-pointer select-none px-3 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--hover-bg)] transition-colors"
                                title="开启后，搜索结果中的图片会自动加载显示"
                            >
                                <input
                                    type="checkbox"
                                    checked={autoLoadImages}
                                    onChange={(e) => onAutoLoadImagesChange(e.target.checked)}
                                    className="w-4 h-4 accent-[#eab308]"
                                />
                                <span className="text-sm flex items-center gap-1">
                                    <span>🖼️</span>
                                    自动加载图片
                                </span>
                            </label>

                            <button
                                type="submit"
                                disabled={isSearching || isExporting}
                                className="btn-primary px-4 py-2 text-sm w-full sm:w-auto min-w-[120px]"
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

                            {onDownloadTemplate && onBatchSearch && (
                                <>
                                    <button
                                        type="button"
                                        onClick={onDownloadTemplate}
                                        disabled={isSearching || isExporting || isBatchSearching}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] text-white text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed w-full sm:w-auto min-w-[120px] justify-center"
                                        title="根据当前选择的列下载批量查询Excel模板"
                                    >
                                        <span>⬇️</span>
                                        下载模板
                                    </button>

                                    <label
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-sm transition-all w-full sm:w-auto min-w-[120px] justify-center cursor-pointer ${(isSearching || isExporting || isBatchSearching) ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''
                                            }`}
                                    >
                                        {isBatchSearching ? (
                                            <span className="flex items-center gap-2">
                                                <span className="spinner w-4 h-4 border-white/30 border-t-white"></span>
                                                查询中...
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-2">
                                                <span>📂</span>
                                                上传查询
                                            </span>
                                        )}
                                        <input
                                            type="file"
                                            accept=".xlsx,.xls"
                                            className="hidden"
                                            onChange={handleFileChange}
                                            disabled={isSearching || isExporting || isBatchSearching}
                                        />
                                    </label>
                                </>
                            )}

                            {onExport && (
                                <button
                                    type="button"
                                    onClick={handleExport}
                                    disabled={isSearching || isExporting}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#10b981] hover:bg-[#059669] text-white text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed w-full sm:w-auto min-w-[120px] justify-center"
                                >
                                    {isExporting ? (
                                        <span className="flex items-center gap-2">
                                            <span className="spinner w-4 h-4 border-white/30 border-t-white"></span>
                                            导出中...
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-2">
                                            <span>📤</span>
                                            批量导出
                                        </span>
                                    )}
                                </button>
                            )}
                        </div>
                    </form>
                </div >
            )
            }
        </div >
    )
}
