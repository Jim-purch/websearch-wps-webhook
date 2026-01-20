'use client'

import type { WpsTable } from '@/lib/wps'

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
    if (isLoading) {
        return (
            <div className="card p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <span className="text-xl">📊</span>
                    步骤 2: 选择数据表
                </h3>
                <div className="flex justify-center py-8">
                    <div className="spinner"></div>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="card p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <span className="text-xl">📊</span>
                    步骤 2: 选择数据表
                </h3>
                <div className="alert alert-error">{error}</div>
            </div>
        )
    }

    if (tables.length === 0) {
        return (
            <div className="card p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <span className="text-xl">📊</span>
                    步骤 2: 选择数据表
                </h3>
                <p className="text-[var(--text-muted)]">此 Token 下没有数据表</p>
            </div>
        )
    }

    return (
        <div className="card p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="text-xl">📊</span>
                步骤 2: 选择数据表（可多选）
            </h3>

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
                                onChange={() => onToggle(table.name)}
                                className="accent-[#eab308]"
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
        </div>
    )
}
