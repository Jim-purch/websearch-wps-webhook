'use client'

import { useState, useRef } from 'react'
import type { WpsColumn } from '@/lib/wps'
import type { ColumnConfig } from '@/hooks/usePartSearch'

interface ColumnSelectorProps {
    columnsData: Record<string, WpsColumn[]>
    selectedColumns: Record<string, string[]>
    columnConfigs: Record<string, ColumnConfig[]>
    onToggle: (tableName: string, columnName: string) => void
    onConfigChange: (tableName: string, newConfig: ColumnConfig[]) => void
    onSelectAll: () => void
    onDeselectAll: () => void
    onFetchAll?: () => void
    onUnfetchAll?: () => void
    onDuplicate?: (tableKey: string) => void
    onRemove?: (tableKey: string) => void
}

export function ColumnSelector({
    columnsData,
    selectedColumns,
    columnConfigs,
    onToggle,
    onConfigChange,
    onSelectAll,
    onDeselectAll,
    onFetchAll,
    onUnfetchAll,
    onDuplicate,
    onRemove
}: ColumnSelectorProps) {
    const [isOpen, setIsOpen] = useState(true)
    const tableKeys = Object.keys(columnsData)
    // 拖拽相关状态
    const [draggedItem, setDraggedItem] = useState<{ tableName: string, index: number } | null>(null)

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

    // 处理 Fetch 切换
    const handleFetchToggle = (tableName: string, configIndex: number, e: React.MouseEvent) => {
        e.stopPropagation()
        const currentConfig = columnConfigs[tableName]
        if (!currentConfig) return

        const newConfig = [...currentConfig]
        newConfig[configIndex] = {
            ...newConfig[configIndex],
            fetch: !newConfig[configIndex].fetch
        }
        onConfigChange(tableName, newConfig)
    }

    // 拖拽处理
    const handleDragStart = (e: React.DragEvent, tableName: string, index: number) => {
        setDraggedItem({ tableName, index })
        e.dataTransfer.effectAllowed = 'move'
        // 设置透明度等样式在 CSS 中处理或者这里简单处理
        if (e.currentTarget instanceof HTMLElement) {
            e.currentTarget.style.opacity = '0.5'
        }
    }

    const handleDragEnd = (e: React.DragEvent) => {
        setDraggedItem(null)
        if (e.currentTarget instanceof HTMLElement) {
            e.currentTarget.style.opacity = '1'
        }
    }

    const handleDragOver = (e: React.DragEvent, tableName: string, index: number) => {
        e.preventDefault()
        if (!draggedItem || draggedItem.tableName !== tableName || draggedItem.index === index) {
            return
        }

        const currentConfig = columnConfigs[tableName]
        if (!currentConfig) return

        const newConfig = [...currentConfig]
        const [movedItem] = newConfig.splice(draggedItem.index, 1)
        newConfig.splice(index, 0, movedItem)

        onConfigChange(tableName, newConfig)
        setDraggedItem({ tableName, index })
    }

    return (
        <div className="card">
            <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <span className="text-xl">📋</span>
                        步骤 3: 选择搜索列与结果显示配置
                    </h3>
                    <p className="text-sm text-[var(--text-muted)] ml-8">
                        拖动列名排序结果表顺序；点击右侧开关控制是否获取该列数据；点击整体选中作为搜索条件
                    </p>
                </div>
                <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                    ▼
                </span>
            </div>

            {isOpen && (
                <div className="p-6 pt-0 border-t border-transparent">
                    {tableKeys.map((tableKey) => {
                        const selected = selectedColumns[tableKey] || []
                        const currentConfig = columnConfigs[tableKey] || []

                        // 如果 config 为空（初始化时），显示加载中或回退到 columnsData
                        // 但通常 usePartSearch 会初始化它

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
                                    {currentConfig.map((colConfig, index) => {
                                        const isSelected = selected.includes(colConfig.name)
                                        const uniqueKey = `${tableKey}-${colConfig.name}`

                                        return (
                                            <div
                                                key={uniqueKey}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, tableKey, index)}
                                                onDragEnd={handleDragEnd}
                                                onDragOver={(e) => handleDragOver(e, tableKey, index)}
                                                className={`
                                                    group flex items-center gap-2 px-2 py-1.5 rounded-md border text-sm transition-all cursor-move select-none
                                                    ${isSelected
                                                        ? 'border-[#eab308] bg-[rgba(234,179,8,0.15)]'
                                                        : 'border-[var(--border)] hover:border-[#667eea] bg-[var(--card-bg)]'
                                                    }
                                                    ${!colConfig.fetch ? 'opacity-60 grayscale-[0.5]' : ''}
                                                `}
                                                title="拖动可调整结果列顺序"
                                            >
                                                {/* 搜索选中 Checkbox */}
                                                <div
                                                    className="flex items-center gap-2 cursor-pointer p-1"
                                                    onClick={() => onToggle(tableKey, colConfig.name)}
                                                    title="点击选择作为搜索条件"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        readOnly
                                                        className="accent-[#eab308] w-3 h-3 pointer-events-none"
                                                    />
                                                    <span className={isSelected ? 'text-[#eab308] font-medium' : ''}>
                                                        {colConfig.name}
                                                    </span>
                                                </div>

                                                {/* 分隔线 */}
                                                <div className="w-[1px] h-3 bg-[var(--border)] mx-1"></div>

                                                {/* Fetch Toggle */}
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleFetchToggle(tableKey, index, e)}
                                                    className={`
                                                        text-[10px] px-1.5 py-0.5 rounded transition-colors
                                                        ${colConfig.fetch
                                                            ? 'bg-[#22c55e]/20 text-[#22c55e] hover:bg-[#22c55e]/30'
                                                            : 'bg-[var(--text-muted)]/20 text-[var(--text-muted)] hover:bg-[var(--text-muted)]/30'
                                                        }
                                                    `}
                                                    title={colConfig.fetch ? "已开启获取数据 (点击不获取)" : "不获取数据 (点击获取)"}
                                                >
                                                    {colConfig.fetch ? '获取' : '不获取'}
                                                </button>
                                            </div>
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
                            全选搜索
                        </button>
                        <button
                            type="button"
                            onClick={onDeselectAll}
                            className="btn-secondary text-sm py-2 px-4"
                        >
                            全不选
                        </button>
                        {onFetchAll && (
                            <button
                                type="button"
                                onClick={onFetchAll}
                                className="btn-secondary text-sm py-2 px-4"
                            >
                                全获取
                            </button>
                        )}
                        {onUnfetchAll && (
                            <button
                                type="button"
                                onClick={onUnfetchAll}
                                className="btn-secondary text-sm py-2 px-4"
                            >
                                全不获取
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

