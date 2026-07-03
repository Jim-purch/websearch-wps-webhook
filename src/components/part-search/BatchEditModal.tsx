'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface BatchEditModalProps {
    isOpen: boolean
    onClose: () => void
    columns: string[]
    selectedCount: number
    onConfirm: (columnName: string, value: string) => void
}

export function BatchEditModal({
    isOpen,
    onClose,
    columns,
    selectedCount,
    onConfirm
}: BatchEditModalProps) {
    const [selectedColumn, setSelectedColumn] = useState('')
    const [value, setValue] = useState('')

    useEffect(() => {
        if (isOpen) {
            setValue('')
            if (columns.length > 0) {
                setSelectedColumn(columns[0])
            } else {
                setSelectedColumn('')
            }
        }
    }, [isOpen, columns])

    if (!isOpen) return null

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedColumn) return
        onConfirm(selectedColumn, value)
        onClose()
    }

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl p-6 w-full max-w-md animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold flex items-center gap-2 text-[var(--text-main)]">
                        <span>✏️</span>
                        批量修改选中行
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors p-1"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="p-3 bg-[rgba(234,179,8,0.08)] border border-[rgba(234,179,8,0.2)] rounded-lg text-sm text-[var(--text-main)]">
                        已选中 <span className="font-semibold text-[#eab308]">{selectedCount}</span> 行数据进行批量修改。
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2 text-[var(--text-main)]">
                            选择需要修改的字段
                        </label>
                        <select
                            value={selectedColumn}
                            onChange={(e) => setSelectedColumn(e.target.value)}
                            className="input w-full cursor-pointer"
                            required
                        >
                            {columns.map((col) => (
                                <option key={col} value={col}>
                                    {col === '_BatchQueryID' ? 'QueryID' : col}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2 text-[var(--text-main)]">
                            统一修改为值
                        </label>
                        <input
                            type="text"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder="请输入新的单元格值"
                            className="input w-full"
                            autoFocus
                        />
                    </div>

                    {/* 按钮 */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2 px-4 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--hover-bg)] transition-colors"
                        >
                            取消
                        </button>
                        <button
                            type="submit"
                            disabled={!selectedColumn}
                            className="flex-1 py-2 px-4 rounded-lg bg-gradient-to-r from-[#eab308] to-[#facc15] text-black font-semibold hover:from-[#ca8a04] hover:to-[#eab308] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            确认修改
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    )
}
