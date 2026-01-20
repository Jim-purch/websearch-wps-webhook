'use client'

import { useState, useCallback } from 'react'
import type { TableSearchResult } from '@/hooks/usePartSearch'

interface ResultTableProps {
    results: TableSearchResult[]
    isSearching: boolean
}

function copyToClipboard(text: string): Promise<boolean> {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text).then(() => true).catch(() => false)
    }
    // Fallback
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    try {
        document.execCommand('copy')
        document.body.removeChild(ta)
        return Promise.resolve(true)
    } catch {
        document.body.removeChild(ta)
        return Promise.resolve(false)
    }
}

function ResultCard({ result, index }: { result: TableSearchResult; index: number }) {
    const [collapsed, setCollapsed] = useState(false)
    const [copiedCell, setCopiedCell] = useState<string | null>(null)

    const records = result.records || []

    // 处理 WPS 记录格式
    const rows = records.map(record => {
        if (record.fields && typeof record.fields === 'object') {
            return record.fields as Record<string, unknown>
        }
        return record
    })

    const columns = rows.length > 0
        ? Object.keys(rows[0]).filter(k => k !== 'id' && k !== 'recordId')
        : []

    const handleCellClick = useCallback(async (value: string, cellKey: string) => {
        const success = await copyToClipboard(value)
        if (success) {
            setCopiedCell(cellKey)
            setTimeout(() => setCopiedCell(null), 500)
        }
    }, [])

    const handleCopyRow = useCallback(async (row: Record<string, unknown>) => {
        const text = Object.values(row).map(v => String(v ?? '')).join('\t')
        await copyToClipboard(text)
    }, [])

    if (result.error) {
        return (
            <div className="card mb-4 overflow-hidden">
                <div className="p-4 bg-[rgba(239,68,68,0.1)] border-b border-[var(--border)]">
                    <h4 className="font-medium text-[#ef4444] flex items-center gap-2">
                        <span>❌</span>
                        搜索失败: {result.tableName}
                    </h4>
                </div>
                <div className="p-4">
                    <p className="text-[#ef4444]">{result.error}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="card mb-4 overflow-hidden">
            {/* Header */}
            <div
                className="p-4 bg-[rgba(234,179,8,0.1)] border-b border-[var(--border)] cursor-pointer flex justify-between items-center"
                onClick={() => setCollapsed(!collapsed)}
            >
                <h4 className="font-medium text-[#eab308] flex items-center gap-2">
                    <span className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}>▼</span>
                    <span>📋</span>
                    {result.tableName}
                    {result.criteriaDescription && (
                        <span className="text-sm font-normal text-[var(--text-muted)]">
                            → {result.criteriaDescription}
                        </span>
                    )}
                </h4>
                <span className="text-sm text-[var(--text-muted)] bg-[var(--card-bg)] px-3 py-1 rounded-full">
                    {result.totalCount} 条结果
                    {result.truncated && ' (已截断)'}
                </span>
            </div>

            {/* Body */}
            {!collapsed && (
                <div className="p-4 overflow-x-auto">
                    {result.truncated && (
                        <div className="mb-4 p-3 rounded-lg bg-[rgba(234,179,8,0.1)] border border-[rgba(234,179,8,0.3)] text-[#eab308] text-sm">
                            ⚠️ 搜索结果超过 {result.maxRecords} 行（共 {result.originalTotalCount} 行），
                            仅显示前 {result.maxRecords} 条。建议使用更精确的搜索条件缩小范围。
                        </div>
                    )}

                    {rows.length === 0 ? (
                        <p className="text-center text-[var(--text-muted)] py-8">未找到匹配的数据</p>
                    ) : (
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr>
                                    {columns.map(col => (
                                        <th
                                            key={col}
                                            className="px-3 py-2 text-left font-semibold text-[var(--text-muted)] border-b border-[var(--border)] whitespace-nowrap"
                                        >
                                            {col}
                                        </th>
                                    ))}
                                    <th className="px-3 py-2 text-left font-semibold text-[var(--text-muted)] border-b border-[var(--border)]">
                                        操作
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, rowIdx) => (
                                    <tr key={rowIdx} className="hover:bg-[rgba(102,126,234,0.05)]">
                                        {columns.map(col => {
                                            let val = row[col]
                                            if (val && typeof val === 'object') {
                                                val = JSON.stringify(val)
                                            }
                                            const cellKey = `${index}-${rowIdx}-${col}`
                                            const isCopied = copiedCell === cellKey

                                            return (
                                                <td
                                                    key={col}
                                                    onClick={() => handleCellClick(String(val ?? ''), cellKey)}
                                                    className={`
                                                        px-3 py-2 border-b border-[var(--border)] cursor-pointer transition-colors
                                                        ${isCopied ? 'bg-[rgba(34,197,94,0.3)]' : 'hover:bg-[rgba(234,179,8,0.2)]'}
                                                    `}
                                                    title="点击复制"
                                                >
                                                    {String(val ?? '')}
                                                </td>
                                            )
                                        })}
                                        <td className="px-3 py-2 border-b border-[var(--border)]">
                                            <button
                                                type="button"
                                                onClick={() => handleCopyRow(row)}
                                                className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[#22c55e] hover:border-[#22c55e] hover:text-white transition-colors"
                                                title="复制整行"
                                            >
                                                📋
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    )
}

export function ResultTable({ results, isSearching }: ResultTableProps) {
    if (isSearching && results.length === 0) {
        return (
            <div className="card p-8">
                <div className="flex flex-col items-center justify-center gap-4">
                    <div className="spinner w-10 h-10"></div>
                    <p className="text-[var(--text-muted)]">正在搜索...</p>
                </div>
            </div>
        )
    }

    if (results.length === 0) {
        return (
            <div className="card p-8">
                <div className="text-center text-[var(--text-muted)]">
                    <div className="text-4xl mb-4">📦</div>
                    <p>请按步骤选择 Token、数据表和列，然后输入关键词搜索</p>
                </div>
            </div>
        )
    }

    return (
        <div>
            {results.map((result, index) => (
                <ResultCard key={`${result.tableName}-${index}`} result={result} index={index} />
            ))}
        </div>
    )
}
