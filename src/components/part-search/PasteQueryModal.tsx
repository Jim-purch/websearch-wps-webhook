'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface PasteQueryModalProps {
    isOpen: boolean
    onClose: () => void
    tableKey: string
    columns: string[]
    onSearch: (data: Array<{ id: string; values: Record<string, string> }>, matchMode: 'fuzzy' | 'exact') => void
    isSearching: boolean
}

interface RowData {
    id: string
    values: Record<string, string>
}

export function PasteQueryModal({
    isOpen,
    onClose,
    tableKey,
    columns,
    onSearch,
    isSearching
}: PasteQueryModalProps) {
    const [rows, setRows] = useState<RowData[]>([{ id: '1', values: {} }])
    const [matchMode, setMatchMode] = useState<'fuzzy' | 'exact'>('exact')
    const tableRef = useRef<HTMLDivElement>(null)
    const [mounted, setMounted] = useState(false)

    // 确保在客户端渲染后才使用 Portal
    useEffect(() => {
        setMounted(true)
    }, [])

    // 重置状态当弹窗打开时
    useEffect(() => {
        if (isOpen) {
            setRows([{ id: '1', values: {} }])
            setMatchMode('exact')
        }
    }, [isOpen])

    // 处理单元格粘贴事件 - 从当前单元格位置开始粘贴
    const handleCellPaste = useCallback((e: React.ClipboardEvent, startRowIndex: number, startColIndex: number) => {
        e.preventDefault()
        const pastedText = e.clipboardData.getData('text')

        if (!pastedText.trim()) return

        // 解析粘贴的数据 (tab 分隔列, 换行分隔行)
        const lines = pastedText.split(/\r?\n/).filter(line => line.trim())

        if (lines.length === 0) return

        setRows(prevRows => {
            // 复制现有行
            const newRows = [...prevRows]

            // 确保有足够的行来容纳粘贴的数据
            const neededRows = startRowIndex + lines.length
            while (newRows.length < neededRows) {
                newRows.push({ id: String(newRows.length + 1), values: {} })
            }

            // 从起始位置开始填充数据
            lines.forEach((line, lineOffset) => {
                const cells = line.split('\t')
                const targetRowIndex = startRowIndex + lineOffset

                cells.forEach((cellValue, cellOffset) => {
                    const targetColIndex = startColIndex + cellOffset
                    if (targetColIndex < columns.length) {
                        const targetColumn = columns[targetColIndex]
                        newRows[targetRowIndex] = {
                            ...newRows[targetRowIndex],
                            id: String(targetRowIndex + 1),
                            values: {
                                ...newRows[targetRowIndex].values,
                                [targetColumn]: cellValue.trim()
                            }
                        }
                    }
                })
            })

            return newRows
        })
    }, [columns])

    // 处理单元格输入
    const handleCellChange = useCallback((rowIndex: number, column: string, value: string) => {
        setRows(prev => {
            const newRows = [...prev]
            newRows[rowIndex] = {
                ...newRows[rowIndex],
                values: {
                    ...newRows[rowIndex].values,
                    [column]: value
                }
            }
            return newRows
        })
    }, [])

    // 添加新行
    const addRow = useCallback(() => {
        setRows(prev => [
            ...prev,
            { id: String(prev.length + 1), values: {} }
        ])
    }, [])

    // 删除行
    const removeRow = useCallback((index: number) => {
        setRows(prev => {
            if (prev.length <= 1) return prev
            const newRows = prev.filter((_, i) => i !== index)
            // 重新编号
            return newRows.map((row, i) => ({ ...row, id: String(i + 1) }))
        })
    }, [])

    // 清空所有数据
    const clearAll = useCallback(() => {
        setRows([{ id: '1', values: {} }])
    }, [])

    // 执行查询
    const handleSearch = useCallback(() => {
        // 过滤掉没有任何值的行
        const validRows = rows.filter(row =>
            Object.values(row.values).some(v => v && v.trim())
        )

        if (validRows.length === 0) {
            return
        }

        onSearch(validRows, matchMode)
    }, [rows, matchMode, onSearch])

    // 获取显示名称
    const displayName = tableKey.includes('__copy_')
        ? `${tableKey.split('__copy_')[0]} (副本${tableKey.split('__copy_')[1]})`
        : tableKey

    if (!isOpen || !mounted) return null

    const modalContent = (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <span>📋</span>
                        粘贴列查询 - {displayName}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors p-1"
                    >
                        ✕
                    </button>
                </div>

                {/* Instructions */}
                <div className="px-4 py-3 bg-[rgba(59,130,246,0.1)] border-b border-[var(--border)]">
                    <p className="text-sm text-[var(--text-muted)]">
                        💡 提示：可直接从 Excel 复制数据后粘贴到下方表格中，数据将自动按列填充。
                    </p>
                </div>

                {/* Table Area */}
                <div
                    ref={tableRef}
                    className="flex-1 overflow-auto p-4"
                    tabIndex={0}
                >
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-[var(--hover-bg)]">
                                <th className="border border-[var(--border)] px-3 py-2 text-left text-sm font-medium w-16">
                                    QueryID
                                </th>
                                {columns.map(col => (
                                    <th
                                        key={col}
                                        className="border border-[var(--border)] px-3 py-2 text-left text-sm font-medium"
                                    >
                                        {col}
                                    </th>
                                ))}
                                <th className="border border-[var(--border)] px-2 py-2 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIndex) => (
                                <tr key={rowIndex} className="hover:bg-[var(--hover-bg)] transition-colors">
                                    <td className="border border-[var(--border)] px-3 py-1 text-center text-sm text-[var(--text-muted)]">
                                        {row.id}
                                    </td>
                                    {columns.map((col, colIndex) => (
                                        <td key={col} className="border border-[var(--border)] p-0">
                                            <input
                                                type="text"
                                                value={row.values[col] || ''}
                                                onChange={(e) => handleCellChange(rowIndex, col, e.target.value)}
                                                onPaste={(e) => handleCellPaste(e, rowIndex, colIndex)}
                                                className="w-full px-2 py-1 bg-transparent border-none outline-none focus:bg-[rgba(102,126,234,0.1)] transition-colors text-sm"
                                                placeholder="..."
                                            />
                                        </td>
                                    ))}
                                    <td className="border border-[var(--border)] px-1 py-1 text-center">
                                        <button
                                            onClick={() => removeRow(rowIndex)}
                                            className="text-[var(--text-muted)] hover:text-red-500 transition-colors p-1 text-xs"
                                            title="删除此行"
                                        >
                                            ✕
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <button
                        onClick={addRow}
                        className="mt-2 text-sm text-[#667eea] hover:text-[#5a67d8] transition-colors flex items-center gap-1"
                    >
                        <span>+</span> 添加行
                    </button>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-4 border-t border-[var(--border)] bg-[var(--hover-bg)]">
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-[var(--text-muted)]">
                            共 {rows.length} 行数据
                        </span>

                        {/* Match Mode Selector */}
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-[var(--foreground)]">查询模式：</span>
                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    onClick={() => setMatchMode('exact')}
                                    className={`px-3 py-1 text-sm rounded-md transition-all ${matchMode === 'exact'
                                        ? 'bg-[#667eea] text-white font-medium'
                                        : 'bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--foreground)] border border-[var(--border)]'
                                        }`}
                                >
                                    精确
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMatchMode('fuzzy')}
                                    className={`px-3 py-1 text-sm rounded-md transition-all ${matchMode === 'fuzzy'
                                        ? 'bg-[#667eea] text-white font-medium'
                                        : 'bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--foreground)] border border-[var(--border)]'
                                        }`}
                                >
                                    模糊
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={clearAll}
                            className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
                        >
                            清空
                        </button>
                        <button
                            onClick={handleSearch}
                            disabled={isSearching || rows.every(r => !Object.values(r.values).some(v => v?.trim()))}
                            className="btn-primary px-6 py-2 text-sm min-w-[100px]"
                        >
                            {isSearching ? (
                                <span className="flex items-center gap-2 justify-center">
                                    <span className="spinner w-4 h-4"></span>
                                    查询中...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2 justify-center">
                                    <span>🔍</span>
                                    执行查询
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )

    return createPortal(modalContent, document.body)
}
