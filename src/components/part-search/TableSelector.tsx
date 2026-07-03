'use client'

import type { WpsTable } from '@/lib/wps'
import { useState, useEffect, useMemo } from 'react'

interface TableSelectorProps {
    tables: WpsTable[]
    selectedTableNames: Set<string>
    isLoading: boolean
    error: string | null
    onToggle: (tableKey: string) => void
    onSelectAll: () => void
    onDeselectAll: () => void
    onLoadColumns: () => void
    columnsData?: Record<string, unknown[]> // 添加列数据用于判断是否已加载
    forceCollapsed?: number // 收起计数器，每次变化时强制收起
    forceExpanded?: number // 展开计数器，每次变化时强制展开
    refreshTokensCache?: Record<string, boolean>
    onRefreshTokensCacheChange?: (value: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>)) => void
}

export function TableSelector({
    tables,
    selectedTableNames,
    isLoading,
    error,
    onToggle,
    onSelectAll,
    onDeselectAll,
    onLoadColumns,
    columnsData = {},
    forceCollapsed,
    forceExpanded,
    refreshTokensCache = {},
    onRefreshTokensCacheChange
}: TableSelectorProps) {
    const [isOpen, setIsOpen] = useState(true)

    // 当加载列信息后自动收起步骤2
    useEffect(() => {
        if (Object.keys(columnsData).length > 0) {
            setIsOpen(false)
        }
    }, [columnsData])

    // 当外部强制收起时
    useEffect(() => {
        if (forceCollapsed && forceCollapsed > 0) {
            setIsOpen(false)
        }
    }, [forceCollapsed])

    // 当外部强制展开时
    useEffect(() => {
        if (forceExpanded && forceExpanded > 0) {
            setIsOpen(true)
        }
    }, [forceExpanded])

    // 将表按 Token 分组
    const tablesByToken = useMemo(() => {
        const groups: Record<string, { tokenName: string; tables: WpsTable[] }> = {}
        for (const table of tables) {
            const tokenId = table.tokenId || 'default'
            const tokenName = table.tokenName || '未知 Token'
            if (!groups[tokenId]) {
                groups[tokenId] = { tokenName, tables: [] }
            }
            groups[tokenId].tables.push(table)
        }
        return groups
    }, [tables])

    const getShortDisplayNames = () => {
        return Array.from(selectedTableNames)
            .map(key => key.includes('::') ? key.split('::')[1] : key)
            .slice(0, 3)
            .join(', ')
    }

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
                            - 已选: {getShortDisplayNames()}
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
                        <p className="text-[var(--text-muted)] mt-2">选中的 Token 下没有数据表</p>
                    ) : (
                        <>
                            <div className="space-y-4 mb-4 mt-2">
                                {Object.entries(tablesByToken).map(([tokenId, group]) => {
                                    const isGsheet = group.tables[0]?.isGoogleSheets
                                    return (
                                        <div key={tokenId} className="border border-[var(--border)] rounded-lg p-4 bg-[var(--card-bg)]">
                                            <h4 className="text-sm font-semibold text-[#eab308] mb-3 flex items-center justify-between border-b border-[var(--border)] pb-2">
                                                <div className="flex items-center gap-1.5">
                                                    <span>📁</span>
                                                    Token: {group.tokenName}
                                                </div>
                                                {isGsheet && (
                                                    <label
                                                        className="flex items-center gap-1.5 cursor-pointer text-xs font-normal text-indigo-400 select-none hover:text-indigo-300 transition-colors"
                                                        title="勾选后，点击下面的“加载列信息”按钮将重新拉取该 Token 下选中表的最新数据并更新缓存"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={!!refreshTokensCache[tokenId]}
                                                            onChange={(e) => {
                                                                onRefreshTokensCacheChange?.(prev => ({
                                                                    ...prev,
                                                                    [tokenId]: e.target.checked
                                                                }))
                                                            }}
                                                            className="w-3.5 h-3.5 accent-indigo-500 rounded border-[var(--border)] bg-[var(--card-bg)]"
                                                        />
                                                        <span>强制刷新缓存</span>
                                                    </label>
                                                )}
                                            </h4>
                                            <div className="flex flex-wrap gap-3">
                                                {group.tables.map((table) => {
                                                    const tableKey = `${table.tokenId}::${table.name}`
                                                    const isSelected = selectedTableNames.has(tableKey)
                                                    return (
                                                        <button
                                                            key={tableKey}
                                                            type="button"
                                                            onClick={() => onToggle(tableKey)}
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
                                                            {table.isGoogleSheets && (
                                                                table.cacheTime ? (
                                                                    <span className="text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded flex items-center gap-0.5" title="当前缓存时间，搜索将快速从该缓存检索">
                                                                        📅 缓存: {table.cacheTime}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded flex items-center gap-0.5" title="尚未加载缓存，首次搜索或点击加载列信息将触发缓存拉取">
                                                                        无缓存
                                                                    </span>
                                                                )
                                                            )}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
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
