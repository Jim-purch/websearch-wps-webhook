'use client'

import type { WpsColumn } from '@/lib/wps'

interface ColumnSelectorProps {
    columnsData: Record<string, WpsColumn[]>
    selectedColumns: Record<string, string[]>
    onToggle: (tableName: string, columnName: string) => void
    onSelectAll: () => void
    onDeselectAll: () => void
}

export function ColumnSelector({
    columnsData,
    selectedColumns,
    onToggle,
    onSelectAll,
    onDeselectAll
}: ColumnSelectorProps) {
    const tableNames = Object.keys(columnsData)

    if (tableNames.length === 0) {
        return null
    }

    return (
        <div className="card p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="text-xl">📋</span>
                步骤 3: 选择搜索列（可多选）
            </h3>

            {tableNames.map((tableName) => {
                const columns = columnsData[tableName] || []
                const selected = selectedColumns[tableName] || []

                return (
                    <div key={tableName} className="mb-6 last:mb-0">
                        <h4 className="font-medium text-[#eab308] mb-3">{tableName}</h4>
                        <div className="flex flex-wrap gap-2">
                            {columns.map((col) => {
                                const isSelected = selected.includes(col.name)
                                return (
                                    <button
                                        key={col.name}
                                        type="button"
                                        onClick={() => onToggle(tableName, col.name)}
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
                                            onChange={() => onToggle(tableName, col.name)}
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
