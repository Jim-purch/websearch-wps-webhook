'use client'

import type { WpsColumn } from '@/lib/wps'

interface ColumnSelectorProps {
    columnsData: Record<string, WpsColumn[]>
    selectedColumns: Record<string, string[]>
    onToggle: (tableName: string, columnName: string) => void
    onSelectAll: () => void
    onDeselectAll: () => void
    onDuplicate?: (tableKey: string) => void
    onRemove?: (tableKey: string) => void
}

export function ColumnSelector({
    columnsData,
    selectedColumns,
    onToggle,
    onSelectAll,
    onDeselectAll,
    onDuplicate,
    onRemove
}: ColumnSelectorProps) {
    const tableKeys = Object.keys(columnsData)

    if (tableKeys.length === 0) {
        return null
    }

    // 获取显示名称
    const getDisplayName = (tableKey: string) => {
        if (tableKey.includes('__copy_')) {
            const parts = tableKey.split('__copy_')
            return `${parts[0]} (副本${parts[1]})`
        }
        return tableKey
    }

    // 判断是否是副本
    const isCopy = (tableKey: string) => tableKey.includes('__copy_')

    return (
        <div className="card p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="text-xl">📋</span>
                步骤 3: 选择搜索列（可多选）
            </h3>

            {tableKeys.map((tableKey) => {
                const columns = columnsData[tableKey] || []
                const selected = selectedColumns[tableKey] || []

                return (
                    <div key={tableKey} className="mb-6 last:mb-0">
                        <div className="flex items-center gap-2 mb-3">
                            <h4 className="font-medium text-[#eab308]">{getDisplayName(tableKey)}</h4>
                            {onDuplicate && (
                                <button
                                    type="button"
                                    onClick={() => onDuplicate(tableKey)}
                                    className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:border-[#667eea] hover:text-[#667eea] transition-colors"
                                    title="复制此表以使用不同列搜索"
                                >
                                    ➕ 复制
                                </button>
                            )}
                            {isCopy(tableKey) && onRemove && (
                                <button
                                    type="button"
                                    onClick={() => onRemove(tableKey)}
                                    className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:border-[#ef4444] hover:text-[#ef4444] transition-colors"
                                    title="删除此副本"
                                >
                                    ✕ 删除
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {columns.map((col) => {
                                const isSelected = selected.includes(col.name)
                                return (
                                    <button
                                        key={col.name}
                                        type="button"
                                        onClick={() => onToggle(tableKey, col.name)}
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
                                            onChange={() => onToggle(tableKey, col.name)}
                                            className="accent-[#eab308] w-3 h-3"
                                        />
                                        <span>{col.name}</span>
                                        {col.type && (
                                            <span className="text-xs text-[var(--text-muted)]">
                                                {col.type}
                                            </span>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )
            })}

            <div className="flex gap-2 mt-4 pt-4 border-t border-[var(--border)]">
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
            </div>
        </div>
    )
}
