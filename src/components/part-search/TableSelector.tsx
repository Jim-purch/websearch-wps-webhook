'use client'

import type { WpsTable } from '@/lib/wps'

import { useState } from 'react'

interface TableSelectorProps {
    tables: WpsTable[]
    selectedTableNames: Set<string>
    isLoading: boolean
    error: string | null
    onToggle: (tableName: string) => void
    onSelectAll: () => void
    onDeselectAll: () => void
    onLoadColumns: () => void
}

export function TableSelector({
    tables,
    selectedTableNames,
    isLoading,
    error,
    onToggle,
    onSelectAll,
    onDeselectAll,
    onLoadColumns
}: TableSelectorProps) {
    const [isOpen, setIsOpen] = useState(true)

    return (
        <div className="card">
            <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <span className="text-xl">📊</span>
                    步骤 2: 选择数据表
                    {!isOpen && selectedTableNames.size > 0 ? (
                        <span className="text-sm font-normal text-[var(--text-muted)] ml-2">
                            - 已选: {Array.from(selectedTableNames).slice(0, 3).join(', ')}
                            {selectedTableNames.size > 3 && ` 等${selectedTableNames.size}个表`}
                        </span>
                    ) : (
                        selectedTableNames.size > 0 && <span className="text-sm font-normal text-[var(--text-muted)]">({selectedTableNames.size} 已选)</span>
                    )}
                </h3>
                <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                    ▼
                </span>
            </div>

            {isOpen && (
                <div className="p-6 pt-0 border-t border-transparent">
                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <div className="spinner"></div>
                        </div>
                    ) : error ? (
                        <div className="alert alert-error">{error}</div>
                    ) : tables.length === 0 ? (
                        <p className="text-[var(--text-muted)]">此 Token 下没有数据表</p>
                    ) : (
                        <>
                            <div className="flex flex-wrap gap-3 mb-4">
                                {tables.map((table) => {
                                    const isSelected = selectedTableNames.has(table.name)
                                    return (
                                        <button
                                            key={table.name}
                                            type="button"
                                            onClick={() => onToggle(table.name)}
                                            className={`
                                                flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-all
                                                ${isSelected
                                                    ? 'border-[#eab308] bg-[rgba(234,179,8,0.15)] text-[#eab308]'
                                                    : 'border-[var(--border)] hover:border-[#667eea]'
                                                }
                                            `}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                readOnly
                                                className="accent-[#eab308] pointer-events-none"
                                            />
                                            <span>{table.name}</span>
                                            <span className="text-xs text-[var(--text-muted)]">
                                                ({table.columns?.length || 0} 列)
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={onSelectAll}
                                    className="btn-secondary text-sm py-2 px-4"
                                >
                                    全选
                                </button>
                                <button
                                    type="button"
                                    onClick={onDeselectAll}
                                    className="btn-secondary text-sm py-2 px-4"
                                >
                                    全不选
                                </button>
                                <button
                                    type="button"
                                    onClick={onLoadColumns}
                                    disabled={selectedTableNames.size === 0}
                                    className="btn-primary text-sm py-2 px-4"
                                >
                                    加载列信息
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
