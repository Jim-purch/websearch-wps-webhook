'use client'

import { useState, useEffect } from 'react'
import { parseTableKey } from '@/hooks/usePartSearch'
import type { WpsColumn } from '@/lib/wps'
import type { ColumnConfig } from '@/hooks/usePartSearch'
import type { Token } from '@/types'

interface ColumnSelectorProps {
    columnsData: Record<string, WpsColumn[]>
    selectedColumns: Record<string, string[]>
    columnConfigs: Record<string, ColumnConfig[]>
    selectedTokens?: Token[]
    onToggle: (tableName: string, columnName: string) => void
    onConfigChange: (tableName: string, newConfig: ColumnConfig[]) => void
    onSelectAll: () => void
    onDeselectAll: () => void
    onFetchAll?: () => void
    onUnfetchAll?: () => void
    onDuplicate?: (tableKey: string) => void
    onRemove?: (tableKey: string) => void
    forceCollapsed?: number // 收起计数器，每次变化时强制收起
    forceExpanded?: number // 展开计数器，每次变化时强制展开
}

export function ColumnSelector({
    columnsData,
    selectedColumns,
    columnConfigs,
    selectedTokens = [],
    onToggle,
    onConfigChange,
    onSelectAll,
    onDeselectAll,
    onFetchAll,
    onUnfetchAll,
    onDuplicate,
    onRemove,
    forceCollapsed,
    forceExpanded
}: ColumnSelectorProps) {
    const [isOpen, setIsOpen] = useState(true)
    const tableKeys = Object.keys(columnsData)
    const [draggedItem, setDraggedItem] = useState<{ tableName: string, index: number } | null>(null)

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

    if (tableKeys.length === 0) {
        return null
    }

    // 获取显示名称 (包含 Token 归属前缀)
    const getDisplayName = (tableKey: string) => {
        const { tokenId, tableName } = parseTableKey(tableKey)
        
        let tokenName = ''
        if (tokenId && selectedTokens) {
            tokenName = selectedTokens.find(t => t.id === tokenId)?.name || ''
        }

        const baseDisplayName = tableName.includes('__copy_')
            ? `${tableName.split('__copy_')[0]} (副本${tableName.split('__copy_')[1]})`
            : tableName

        if (tokenName) {
            return `[${tokenName}] ${baseDisplayName}`
        }
        return baseDisplayName
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

    // 处理 同值批量搜索 状态切换
    const handleSameValueToggle = (tableName: string, configIndex: number, e: React.MouseEvent) => {
        e.stopPropagation()
        const currentConfig = columnConfigs[tableName]
        if (!currentConfig) return

        const newConfig = [...currentConfig]
        newConfig[configIndex] = {
            ...newConfig[configIndex],
            sameValue: !newConfig[configIndex].sameValue
        }
        onConfigChange(tableName, newConfig)
    }

    // 拖拽处理
    const handleDragStart = (e: React.DragEvent, tableName: string, index: number) => {
        setDraggedItem({ tableName, index })
        e.dataTransfer.effectAllowed = 'move'
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
                <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <span className="text-xl">📋</span>
                        步骤 3: 选择搜索列与结果显示配置
                    </h3>
                    <span className="text-xs text-[var(--text-muted)]">
                        拖动列名排序 | 右侧开关控制获取 | 🔗 同值开启后支持批量/联合查同一个值
                    </span>
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

                        return (
                            <div key={tableKey} className="mb-3.5 last:mb-0">
                                <div className="flex items-center gap-2 mb-1.5">
                                    <h4 className="font-medium text-[#eab308] text-sm">{getDisplayName(tableKey)}</h4>
                                    {onDuplicate && (
                                        <button
                                            type="button"
                                            onClick={() => onDuplicate(tableKey)}
                                            className="text-[11px] px-1.5 py-0.5 rounded border border-[var(--border)] hover:border-[#667eea] hover:text-[#667eea] transition-colors"
                                            title="复制此表以使用不同列搜索"
                                        >
                                            ➕ 复制
                                        </button>
                                    )}
                                    {isCopy(tableKey) && onRemove && (
                                        <button
                                            type="button"
                                            onClick={() => onRemove(tableKey)}
                                            className="text-[11px] px-1.5 py-0.5 rounded border border-[var(--border)] hover:border-[#ef4444] hover:text-[#ef4444] transition-colors"
                                            title="删除此副本"
                                        >
                                            ✕ 删除
                                        </button>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {currentConfig.map((colConfig, index) => {
                                        const { tokenId } = parseTableKey(tableKey)
                                        const isShared = tokenId.startsWith('preset::')
                                        if (isShared && !colConfig.fetch) return null

                                        const isSelected = selected.includes(colConfig.name)
                                        const uniqueKey = `${tableKey}-${colConfig.name}`

                                        return (
                                             <div key={uniqueKey} className="relative select-none">
                                                 {/* 占位 Spacer：保持页面文档流稳定，避免悬停展开时导致周围按钮重排或折行 */}
                                                 <div className="flex items-center gap-1.5 px-2 py-1 opacity-0 pointer-events-none text-sm border border-transparent whitespace-nowrap">
                                                     <input type="checkbox" className="w-3.5 h-3.5" />
                                                     <span>{colConfig.name}</span>
                                                     <div className="flex items-center gap-1.5 ml-1">
                                                         <span className="w-1.5 h-1.5 rounded-full" />
                                                         <span className="w-1.5 h-1.5 rounded-full" />
                                                     </div>
                                                 </div>

                                                 {/* 实际交互按钮：悬浮时绝对定位浮起并向右侧无感知展开 */}
                                                 <div
                                                     draggable
                                                     onDragStart={(e) => handleDragStart(e, tableKey, index)}
                                                     onDragEnd={handleDragEnd}
                                                     onDragOver={(e) => handleDragOver(e, tableKey, index)}
                                                     className={`
                                                         group absolute left-0 top-0 h-full w-full hover:w-auto hover:min-w-full hover:z-50 hover:shadow-lg hover:pr-3
                                                         flex items-center gap-1.5 px-2 py-1 rounded border text-sm transition-all duration-150 cursor-move whitespace-nowrap
                                                         ${isSelected
                                                             ? 'border-[#eab308] bg-[rgba(234,179,8,0.15)]'
                                                             : 'border-[var(--border)] hover:border-[#667eea] bg-[var(--card-bg)]'
                                                         }
                                                         ${!colConfig.fetch ? 'opacity-60 grayscale-[0.5] hover:opacity-100 hover:grayscale-0' : ''}
                                                     `}
                                                     title="拖动可调整结果列顺序"
                                                 >
                                                     {/* 搜索选中 Checkbox */}
                                                     <div
                                                         className="flex items-center gap-1.5 cursor-pointer p-0.5"
                                                         onClick={() => onToggle(tableKey, colConfig.name)}
                                                         title="点击选择作为搜索条件"
                                                     >
                                                         <input
                                                             type="checkbox"
                                                             checked={isSelected}
                                                             readOnly
                                                             className="accent-[#eab308] w-3.5 h-3.5 pointer-events-none"
                                                         />
                                                         <span className={isSelected ? 'text-[#eab308] font-medium' : ''}>
                                                             {colConfig.name}
                                                         </span>
                                                     </div>

                                                     {/* 默认状态点 */}
                                                     <div className="flex items-center gap-1.5 ml-1 group-hover:hidden transition-all">
                                                         <span 
                                                             className={`w-1.5 h-1.5 rounded-full ${colConfig.fetch ? 'bg-[#22c55e]' : 'bg-[var(--text-muted)]/30'}`}
                                                             title={colConfig.fetch ? "已开启获取数据" : "未开启获取数据"}
                                                         />
                                                         <span 
                                                             className={`w-1.5 h-1.5 rounded-full ${colConfig.sameValue ? 'bg-[#eab308]' : 'bg-[var(--text-muted)]/10'}`}
                                                             title={colConfig.sameValue ? "已启用同值批量搜索" : "未启用同值"}
                                                         />
                                                     </div>

                                                     {/* 分隔线与动作按钮 */}
                                                     <div className="hidden group-hover:flex items-center gap-1.5 transition-all">
                                                         <div className="w-[1px] h-3 bg-[var(--border)] mx-0.5"></div>

                                                         {/* Fetch Toggle */}
                                                         <button
                                                             type="button"
                                                             onClick={(e) => handleFetchToggle(tableKey, index, e)}
                                                             className={`
                                                                 text-[11px] px-1.5 py-0.5 rounded transition-colors whitespace-nowrap
                                                                 ${colConfig.fetch
                                                                     ? 'bg-[#22c55e]/20 text-[#22c55e] hover:bg-[#22c55e]/30'
                                                                     : 'bg-[var(--text-muted)]/20 text-[var(--text-muted)] hover:bg-[var(--text-muted)]/30'
                                                                 }
                                                             `}
                                                             title={colConfig.fetch ? "已开启获取数据 (点击不获取)" : "不获取数据 (点击获取)"}
                                                         >
                                                             {colConfig.fetch ? '获取' : '不获取'}
                                                         </button>

                                                         {/* Same Value Toggle */}
                                                         <button
                                                             type="button"
                                                             onClick={(e) => handleSameValueToggle(tableKey, index, e)}
                                                             className={`
                                                                 text-[11px] px-1.5 py-0.5 rounded border transition-colors whitespace-nowrap
                                                                 ${colConfig.sameValue
                                                                     ? 'bg-[#eab308]/20 text-[#eab308] border-[#eab308]/40 hover:bg-[#eab308]/30'
                                                                     : 'bg-[var(--text-muted)]/10 text-[var(--text-muted)] border-transparent hover:bg-[var(--text-muted)]/20'
                                                                 }
                                                             `}
                                                             title={colConfig.sameValue ? "已启用同值批量搜索 (点击取消)" : "点击启用同值批量搜索"}
                                                         >
                                                             🔗 同值
                                                         </button>
                                                     </div>
                                                 </div>
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
