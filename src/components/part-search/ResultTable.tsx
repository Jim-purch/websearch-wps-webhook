'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { TableSearchResult } from '@/hooks/usePartSearch'
import { useTableSelection } from '@/hooks/useTableSelection'

interface ResultTableProps {
    results: TableSearchResult[]
    isSearching: boolean
    tokenId?: string  // 用于获取图片URL
    autoLoadImages?: boolean  // 自动加载图片
    onImageLoad?: (tableName: string, cellAddress: string, url: string) => void // 图片加载回调
    imageUrlCache?: Record<string, string> // 图片缓存
    onExportSingle?: (result: TableSearchResult) => void // 导出单个结果的回调
    modifiedCells?: Record<string, any>
    updateCell?: (resultIndex: number, rowIdx: number, columnName: string, newValue: any) => void
    revertChanges?: () => void
    saveChanges?: () => Promise<void>
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

// 图片尺寸常量
const IMAGE_THUMBNAIL_SIZE = { maxWidth: 60, maxHeight: 48 }

// 图片预览组件 - 支持缩略图和灯箱效果
function ImageWithPreview({
    src,
    onCopy,
    isCopied,
    onRetry
}: {
    src: string;
    onCopy: () => void;
    isCopied: boolean;
    onRetry?: () => void;
}) {
    const [showPreview, setShowPreview] = useState(false)
    const [imgError, setImgError] = useState(false)
    const [retryCount, setRetryCount] = useState(0)
    const [mounted, setMounted] = useState(false)

    // 确保在客户端渲染后才使用 Portal
    useEffect(() => {
        setMounted(true)
    }, [])

    // 当 src 改变时 (例如重新获取了URL)，重置错误状态
    useEffect(() => {
        setImgError(false)
    }, [src])

    if (imgError) {
        return (
            <span
                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer
                    ${isCopied ? 'bg-[rgba(34,197,94,0.3)] text-[#22c55e]' : 'bg-[rgba(239,68,68,0.15)] text-[#ef4444] hover:bg-[rgba(239,68,68,0.25)]'}`}
                onClick={(e) => {
                    e.stopPropagation()
                    setImgError(false)
                    if (onRetry) {
                        onRetry()
                    } else {
                        setRetryCount(c => c + 1)
                    }
                }}
                title="图片加载失败，点击重试"
            >
                ❌ 图片加载失败
            </span>
        )
    }

    const previewModal = showPreview && mounted ? createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70"
            onClick={() => setShowPreview(false)}
        >
            <div className="relative max-w-[90vw] max-h-[90vh]">
                <img
                    src={src}
                    alt="大图预览"
                    className="max-w-full max-h-[90vh] object-contain rounded-lg"
                />
                <button
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 text-white hover:bg-black/70 flex items-center justify-center"
                    onClick={(e) => { e.stopPropagation(); setShowPreview(false) }}
                >
                    ✕
                </button>
                <button
                    className="absolute bottom-2 right-2 px-3 py-1 rounded bg-[#eab308] text-black text-sm hover:bg-[#ca9a06]"
                    onClick={(e) => { e.stopPropagation(); onCopy() }}
                >
                    📋 复制链接
                </button>
            </div>
        </div>,
        document.body
    ) : null

    return (
        <>
            <img
                key={retryCount}
                src={src}
                alt="图片"
                style={{ maxWidth: IMAGE_THUMBNAIL_SIZE.maxWidth, maxHeight: IMAGE_THUMBNAIL_SIZE.maxHeight }}
                className={`object-contain cursor-pointer rounded border ${isCopied ? 'border-[#22c55e]' : 'border-[var(--border)] hover:border-[#eab308]'} transition-colors`}
                onClick={() => setShowPreview(true)}
                onError={() => setImgError(true)}
                title="点击查看大图"
            />
            {previewModal}
        </>
    )
}

import { getImageUrls } from '@/lib/wps'

function LazyImageCell({
    tokenId,
    sheetName,
    cellAddress,
    imageId,
    onCopy,
    isCopied,
    autoLoad = false,
    onImageLoad,
    cachedUrl
}: {
    tokenId?: string;
    sheetName: string;
    cellAddress: string;
    imageId: string;
    onCopy: (text: string) => void;
    isCopied: boolean;
    autoLoad?: boolean;
    onImageLoad?: (tableName: string, cellAddress: string, url: string) => void
    cachedUrl?: string
}) {
    const [imageUrl, setImageUrl] = useState<string | null>(cachedUrl || null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [attempted, setAttempted] = useState(false)
    const [forceLoad, setForceLoad] = useState(false)

    // 如果 cachedUrl 改变 (例如从父组件传入了新的缓存)，更新本地状态
    useEffect(() => {
        if (cachedUrl) {
            setImageUrl(cachedUrl)
        }
    }, [cachedUrl])

    const fetchImageUrl = useCallback(async () => {
        // 如果已经有URL (比如来自缓存)，不需要重新获取
        if (imageUrl || !tokenId || loading || attempted) return

        setLoading(true)
        setAttempted(true)
        try {
            const result = await getImageUrls(tokenId, sheetName, [cellAddress])
            if (result.success && result.data?.imageUrls?.[cellAddress]) {
                const url = result.data.imageUrls[cellAddress]
                setImageUrl(url)
                onImageLoad?.(sheetName, cellAddress, url)
            } else {
                setError('无法获取图片')
            }
        } catch (e) {
            setError('请求失败')
        } finally {
            setLoading(false)
        }
    }, [tokenId, sheetName, cellAddress, loading, attempted, onImageLoad, imageUrl])

    // 自动加载 或 强制重试
    useEffect(() => {
        if ((autoLoad || forceLoad) && tokenId && !attempted && !loading && !imageUrl) {
            fetchImageUrl()
            if (forceLoad) setForceLoad(false)
        }
    }, [autoLoad, forceLoad, tokenId, attempted, loading, fetchImageUrl, imageUrl])

    // 如果已获取到URL，显示图片
    if (imageUrl) {
        return (
            <ImageWithPreview
                src={imageUrl}
                onCopy={() => onCopy(imageUrl)}
                isCopied={isCopied}
                onRetry={() => {
                    // 图片加载失败时，清除当前URL并强制重试（触发重新获取URL）
                    setImageUrl(null)
                    setAttempted(false)
                    setForceLoad(true)
                }}
            />
        )
    }

    // 错误状态
    if (error) {
        const shortId = imageId.length > 16 ? `${imageId.slice(0, 8)}...${imageId.slice(-6)}` : imageId
        return (
            <div
                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition-colors
                    ${isCopied ? 'bg-[rgba(34,197,94,0.3)] text-[#22c55e]' : 'bg-[rgba(239,68,68,0.15)] text-[#ef4444] hover:bg-[rgba(239,68,68,0.25)]'}`}
                onClick={(e) => {
                    e.stopPropagation()
                    setError(null)
                    setAttempted(false)
                    setForceLoad(true)
                }}
                title={`无法加载图片，点击重试 (ID: ${imageId})`}
            >
                <span>⚠️</span>
                <span className="font-mono">{shortId}</span>
            </div>
        )
    }

    // 加载状态
    if (loading) {
        return (
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-[rgba(234,179,8,0.15)] text-[#eab308]">
                <span className="animate-spin">⏳</span>
                <span>加载中...</span>
            </div>
        )
    }

    // 初始状态 - 显示加载按钮
    const shortId = imageId.length > 16 ? `${imageId.slice(0, 8)}...${imageId.slice(-6)}` : imageId
    return (
        <div
            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition-colors
                ${isCopied ? 'bg-[rgba(34,197,94,0.3)] text-[#22c55e]' : 'bg-[rgba(234,179,8,0.15)] text-[#eab308] hover:bg-[rgba(234,179,8,0.3)]'}`}
            onClick={tokenId ? fetchImageUrl : () => onCopy(imageId)}
            title={tokenId ? `点击加载图片 (ID: ${imageId})` : `点击复制ID: ${imageId}`}
        >
            <span>🖼️</span>
            <span className="font-mono">{shortId}</span>
            {tokenId && <span className="text-[10px] opacity-60">[载入]</span>}
        </div>
    )
}

function ResultCard({
    result,
    index,
    tokenId,
    autoLoadImages,
    onImageLoad,
    imageUrlCache,
    onExportSingle,
    modifiedCells,
    updateCell
}: {
    result: TableSearchResult;
    index: number;
    tokenId?: string;
    autoLoadImages?: boolean;
    onImageLoad?: (tableName: string, cellAddress: string, url: string) => void;
    imageUrlCache?: Record<string, string>;
    onExportSingle?: (result: TableSearchResult) => void;
    modifiedCells?: Record<string, any>;
    updateCell?: (resultIndex: number, rowIdx: number, columnName: string, newValue: any) => void;
}) {
    const [collapsed, setCollapsed] = useState(false)
    const [copiedCell, setCopiedCell] = useState<string | null>(null)
    const [copyToast, setCopyToast] = useState(false)
    const [mounted, setMounted] = useState(false)
    
    // 双击编辑状态
    const [editingCell, setEditingCell] = useState<{ rowIdx: number; colIdx: number } | null>(null)
    const [editValue, setEditValue] = useState('')

    // 确保在客户端渲染后才使用 Portal
    useEffect(() => {
        setMounted(true)
    }, [])

    // 排序状态: { key: 列名, direction: 'asc' | 'desc' | null }
    const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: 'asc' | 'desc' | null }>({
        key: null,
        direction: null
    })

    const handleSort = useCallback((key: string) => {
        setSortConfig(prev => {
            if (prev.key !== key) {
                return { key, direction: 'asc' }
            }
            if (prev.direction === 'asc') {
                return { key, direction: 'desc' }
            }
            if (prev.direction === 'desc') {
                return { key: null, direction: null }
            }
            return { key, direction: 'asc' }
        })
    }, [])

    const records = result.records || []

    // 处理 WPS 记录格式
    const rows = useMemo(() => {
        const list = records.map(r => {
            if (r.fields && typeof r.fields === 'object') {
                return {
                    id: r.id,
                    recordId: r.recordId,
                    ...r.fields as Record<string, unknown>
                }
            }
            return r
        })

        if (!sortConfig.key) return list

        return [...list].sort((a, b) => {
            const aVal = a[sortConfig.key!]
            const bVal = b[sortConfig.key!]
            const aStr = String(aVal ?? '')
            const bStr = String(bVal ?? '')

            // 尝试数字比较
            const aNum = Number(aStr)
            const bNum = Number(bStr)
            if (!isNaN(aNum) && !isNaN(bNum) && aStr.trim() !== '' && bStr.trim() !== '') {
                return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum
            }

            // 字符串比较
            return sortConfig.direction === 'asc'
                ? aStr.localeCompare(bStr, 'zh-CN', { numeric: true })
                : bStr.localeCompare(aStr, 'zh-CN', { numeric: true })
        })
    }, [records, sortConfig])

    const hasBatchQueryID = records.some(r => '_BatchQueryID' in r)

    const columns = rows.length > 0
        ? Object.keys(rows[0]).filter(k => k !== 'id' && k !== 'recordId' && k !== '_BatchQueryID')
        : []

    const originalQueryColumns = result.originalQueryColumns || []

    // 优先使用 displayColumns (来自 Step 3 的配置顺序)，如果没有则回退到默认逻辑
    const displayColumns = result.displayColumns && result.displayColumns.length > 0
        ? (hasBatchQueryID
            ? ['_BatchQueryID', ...originalQueryColumns, ...result.displayColumns]
            : result.displayColumns
        )
        : (hasBatchQueryID
            ? ['_BatchQueryID', ...originalQueryColumns, ...columns.filter(c => !originalQueryColumns.includes(c))]
            : columns
        )

    // 表格选择功能
    const {
        selection,
        isSelecting,
        handleMouseDown,
        handleMouseEnter,
        handleMouseUp,
        isCellSelected,
        selectColumn,
        clearSelection,
        copySelection,
        containerProps
    } = useTableSelection({
        onCopy: () => {
            setCopyToast(true)
            setTimeout(() => setCopyToast(false), 1500)
        }
    })

    // 获取单元格值的文本内容
    const getCellText = useCallback((rowIdx: number, colIdx: number): string => {
        const row = rows[rowIdx]
        if (!row) return ''
        const col = displayColumns[colIdx]
        if (!col) return ''
        const val = row[col]

        // 处理图片对象
        if (val && typeof val === 'object' && '_type' in val) {
            const imgObj = val as { _type: string; imageUrl?: string; imageId?: string; cellAddress?: string }

            if (imgObj.imageUrl) return imgObj.imageUrl

            if (imgObj._type === 'dispimg' && imgObj.cellAddress && imageUrlCache) {
                const cacheKey = `${result.realTableName || result.tableName}__${imgObj.cellAddress}`
                const cachedUrl = imageUrlCache[cacheKey]
                if (cachedUrl) return cachedUrl
            }

            if (imgObj.imageId) return imgObj.imageId
        }

        if (val && typeof val === 'object') {
            return JSON.stringify(val)
        }

        return String(val ?? '')
    }, [rows, displayColumns, imageUrlCache, result.realTableName, result.tableName])

    // 键盘复制与粘贴支持 (Ctrl+C / Ctrl+V)
    useEffect(() => {
        if (collapsed) return

        const handleKeyDown = async (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selection) {
                e.preventDefault()
                copySelection(getCellText)
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'v' && selection && updateCell) {
                const activeElement = document.activeElement
                if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
                    return
                }

                e.preventDefault()

                try {
                    const text = await navigator.clipboard.readText()
                    if (!text) return

                    const lines = text.split('\n').map(line => line.split('\t'))
                    if (lines.length === 0) return

                    const startRow = Math.min(selection.start.row, selection.end.row)
                    const startCol = Math.min(selection.start.col, selection.end.col)

                    for (let r = 0; r < lines.length; r++) {
                        const targetRowIdx = startRow + r
                        if (targetRowIdx >= rows.length) break

                        const rowValues = lines[r]
                        for (let c = 0; c < rowValues.length; c++) {
                            const targetColIdx = startCol + c
                            if (targetColIdx >= displayColumns.length) break

                            const colName = displayColumns[targetColIdx]
                            if (colName === '_BatchQueryID' || colName === '_rowNumber') continue

                            const val = rowValues[c].trim()
                            updateCell(index, targetRowIdx, colName, val)
                        }
                    }
                } catch (err) {
                    console.error('粘贴数据失败:', err)
                }
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [collapsed, selection, copySelection, getCellText, rows.length, displayColumns, updateCell, index])

    const handleCellClick = useCallback(async (value: string, cellKey: string) => {
        const success = await copyToClipboard(value)
        if (success) {
            setCopiedCell(cellKey)
            setTimeout(() => setCopiedCell(null), 500)
        }
    }, [])

    const handleCopyRow = useCallback(async (row: Record<string, unknown>) => {
        const text = displayColumns.map(col => String(row[col] ?? '')).join('\t')
        await copyToClipboard(text)
        setCopyToast(true)
        setTimeout(() => setCopyToast(false), 1500)
    }, [displayColumns])

    if (result.error && records.length === 0) {
        return (
            <div className="card mb-4 overflow-hidden">
                <div className="p-4 bg-[rgba(239,68,68,0.1)] border-b border-[var(--border)]">
                    <h4 className="font-medium text-[#ef4444] flex items-center gap-2">
                        <span>❌</span>
                        搜索失败: {result.tableName}
                    </h4>
                </div>
                <div className="p-6">
                    <p className="text-sm text-[var(--text-muted)] mb-4">{result.error}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="card mb-6 overflow-hidden">
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
                <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--text-muted)] bg-[var(--card-bg)] px-3 py-1 rounded-full">
                        {result.totalCount} 条结果
                        {result.truncated && ' (已截断)'}
                        {result.error && ' (部分失败)'}
                    </span>
                    {onExportSingle && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                onExportSingle(result)
                            }}
                            className="btn-export flex items-center gap-1 px-3 py-1 text-sm"
                            title="导出此结果表"
                        >
                            <span>📤</span>
                            导出
                        </button>
                    )}
                </div>
            </div>

            {copyToast && mounted && createPortal(
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-lg bg-[#22c55e] text-white text-sm font-medium shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
                    ✓ 已复制到剪贴板
                </div>,
                document.body
            )}

            {!collapsed && (
                <div
                    className={`p-4 overflow-x-auto ${isSelecting ? 'select-none' : ''}`}
                    {...containerProps}
                >
                    {result.error && (
                        <div className="mb-4 p-3 rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[#ef4444] text-sm flex items-center gap-2">
                            <span>❌</span>
                            <span>部分搜索失败: {result.error}</span>
                        </div>
                    )}
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
                                    {displayColumns.map((col, colIdx) => (
                                        <th
                                            key={col}
                                            className="px-3 py-2 text-left font-semibold text-[var(--text-muted)] border-b border-[var(--border)] whitespace-nowrap group transition-colors"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span
                                                    className="cursor-pointer hover:text-[var(--text-main)]"
                                                    onClick={() => selectColumn(colIdx, rows.length)}
                                                    title="点击全选此列"
                                                >
                                                    {col === '_BatchQueryID' ? 'QueryID' : col}
                                                </span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleSort(col)
                                                    }}
                                                    className={`p-1 rounded hover:bg-[var(--hover-bg)] transition-colors opacity-0 group-hover:opacity-100 ${sortConfig.key === col ? 'opacity-100 text-[#eab308]' : ''
                                                        }`}
                                                    title="点击切换排序：无 -> 升序 -> 降序"
                                                >
                                                    {sortConfig.key === col ? (
                                                        sortConfig.direction === 'asc' ? '🔼' : '🔽'
                                                    ) : '↕️'}
                                                </button>
                                            </div>
                                        </th>
                                    ))}
                                    <th className="px-3 py-2 text-left font-semibold text-[var(--text-muted)] border-b border-[var(--border)]">
                                        操作
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, rowIdx) => (
                                    <tr key={rowIdx} className="transition-colors">
                                        {displayColumns.map((col, colIdx) => {
                                            const val = row[col]
                                            const cellKey = `${index}-${rowIdx}-${col}`
                                            const isCopied = copiedCell === cellKey
                                            const isSelected = isCellSelected(rowIdx, colIdx)
                                            const modifiedKey = `${index}__${rowIdx}__${col}`
                                            const isModified = modifiedCells && modifiedCells[modifiedKey] !== undefined
                                            const isEditing = editingCell && editingCell.rowIdx === rowIdx && editingCell.colIdx === colIdx

                                            // 普通值处理
                                            let displayVal = val
                                            if (val && typeof val === 'object' && !('_type' in val)) {
                                                displayVal = JSON.stringify(val)
                                            }
                                            if (val && typeof val === 'object' && '_type' in val) {
                                                const imgObj = val as { _type: string; value?: string }
                                                displayVal = imgObj.value || ''
                                            }
                                            const strVal = String(displayVal ?? '')

                                            // 编辑输入框
                                            if (isEditing) {
                                                return (
                                                    <td
                                                        key={col}
                                                        className="px-2 py-1 border-b border-[var(--border)] bg-[rgba(234,179,8,0.05)]"
                                                    >
                                                        <input
                                                            type="text"
                                                            className="w-full px-2 py-1 text-sm bg-[var(--bg)] border border-[#eab308] rounded focus:outline-none focus:ring-2 focus:ring-[#eab308] text-[var(--text-main)]"
                                                            value={editValue}
                                                            autoFocus
                                                            onChange={(e) => setEditValue(e.target.value)}
                                                            onBlur={() => {
                                                                if (updateCell && editValue !== strVal) {
                                                                    updateCell(index, rowIdx, col, editValue)
                                                                }
                                                                setEditingCell(null)
                                                            }}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    if (updateCell && editValue !== strVal) {
                                                                        updateCell(index, rowIdx, col, editValue)
                                                                    }
                                                                    setEditingCell(null)
                                                                } else if (e.key === 'Escape') {
                                                                    setEditingCell(null)
                                                                }
                                                            }}
                                                        />
                                                    </td>
                                                )
                                            }

                                            const cellClassName = `
                                                px-3 py-2 border-b border-[var(--border)] cursor-cell transition-colors
                                                ${isSelected
                                                    ? 'bg-[rgba(102,126,234,0.3)]'
                                                    : isModified
                                                        ? 'bg-[rgba(234,179,8,0.12)] border-l-2 border-l-[#eab308] font-medium text-[#eab308]'
                                                        : isCopied
                                                            ? 'bg-[rgba(34,197,94,0.2)]'
                                                            : 'hover:bg-[var(--hover-bg)]'
                                                }
                                            `

                                            const handleDblClick = () => {
                                                if (updateCell && col !== '_BatchQueryID' && col !== '_rowNumber') {
                                                    setEditingCell({ rowIdx, colIdx })
                                                    setEditValue(strVal)
                                                }
                                            }

                                            // 图片对象 (AirScript)
                                            if (val && typeof val === 'object' && '_type' in val) {
                                                const imgObj = val as { _type: string; imageUrl?: string; imageId?: string; value?: string }

                                                if (imgObj._type === 'image' && imgObj.imageUrl) {
                                                    return (
                                                        <td
                                                            key={col}
                                                            data-selectable-cell
                                                            className={cellClassName}
                                                            onMouseDown={(e) => handleMouseDown(rowIdx, colIdx, e)}
                                                            onMouseEnter={() => handleMouseEnter(rowIdx, colIdx)}
                                                            onDoubleClick={handleDblClick}
                                                        >
                                                            <ImageWithPreview
                                                                src={imgObj.imageUrl}
                                                                onCopy={() => handleCellClick(imgObj.imageUrl!, cellKey)}
                                                                isCopied={isCopied}
                                                            />
                                                        </td>
                                                    )
                                                }

                                                if (imgObj._type === 'dispimg' && imgObj.imageId) {
                                                    const imgObjFull = imgObj as { _type: string; imageId: string; cellAddress?: string; value?: string }

                                                    if (imgObjFull.cellAddress && tokenId) {
                                                        const cacheKey = `${result.realTableName || result.tableName}__${imgObjFull.cellAddress}`
                                                        const cachedUrl = imageUrlCache?.[cacheKey]

                                                        return (
                                                            <td
                                                                key={col}
                                                                data-selectable-cell
                                                                className={cellClassName}
                                                                onMouseDown={(e) => handleMouseDown(rowIdx, colIdx, e)}
                                                                onMouseEnter={() => handleMouseEnter(rowIdx, colIdx)}
                                                                onDoubleClick={handleDblClick}
                                                            >
                                                                <LazyImageCell
                                                                    tokenId={tokenId}
                                                                    sheetName={result.realTableName || result.tableName}
                                                                    cellAddress={imgObjFull.cellAddress}
                                                                    imageId={imgObjFull.imageId}
                                                                    onCopy={(text) => handleCellClick(text, cellKey)}
                                                                    isCopied={isCopied}
                                                                    autoLoad={autoLoadImages}
                                                                    onImageLoad={onImageLoad}
                                                                    cachedUrl={cachedUrl}
                                                                 />
                                                            </td>
                                                        )
                                                    }

                                                    const shortId = imgObj.imageId.length > 16
                                                        ? `${imgObj.imageId.slice(0, 8)}...${imgObj.imageId.slice(-6)}`
                                                        : imgObj.imageId
                                                    return (
                                                        <td
                                                            key={col}
                                                            data-selectable-cell
                                                            className={cellClassName}
                                                            onMouseDown={(e) => handleMouseDown(rowIdx, colIdx, e)}
                                                            onMouseEnter={() => handleMouseEnter(rowIdx, colIdx)}
                                                            onDoubleClick={handleDblClick}
                                                        >
                                                            <div
                                                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-[rgba(234,179,8,0.15)] text-[#eab308]"
                                                                title={`图片ID: ${imgObj.imageId}`}
                                                            >
                                                                <span>🖼️</span>
                                                                <span className="font-mono">{shortId}</span>
                                                            </div>
                                                        </td>
                                                    )
                                                }
                                            }

                                            // 检测是否为 URL
                                            const urlPattern = /^https?:\/\/[^\s]+$/i
                                            const isUrl = urlPattern.test(strVal.trim())

                                            // 检测是否为图片 URL
                                            const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico)(\?.*)?$/i
                                            const isImageUrl = isUrl && imageExtensions.test(strVal.trim())

                                            if (isImageUrl && autoLoadImages) {
                                                return (
                                                    <td
                                                        key={col}
                                                        data-selectable-cell
                                                        className={cellClassName}
                                                        onMouseDown={(e) => handleMouseDown(rowIdx, colIdx, e)}
                                                        onMouseEnter={() => handleMouseEnter(rowIdx, colIdx)}
                                                        onDoubleClick={handleDblClick}
                                                    >
                                                        <ImageWithPreview
                                                            src={strVal.trim()}
                                                            onCopy={() => handleCellClick(strVal.trim(), cellKey)}
                                                            isCopied={isCopied}
                                                        />
                                                    </td>
                                                )
                                            }

                                            if (isUrl) {
                                                return (
                                                    <td
                                                        key={col}
                                                        data-selectable-cell
                                                        onMouseDown={(e) => handleMouseDown(rowIdx, colIdx, e)}
                                                        onMouseEnter={() => handleMouseEnter(rowIdx, colIdx)}
                                                        onDoubleClick={handleDblClick}
                                                        className={cellClassName}
                                                        title="双击进行编辑，或拖拽选择区域按 Ctrl+C 复制"
                                                    >
                                                        <a
                                                            href={strVal.trim()}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className={`inline-flex items-center gap-1 text-[#3b82f6] hover:text-[#60a5fa] hover:underline transition-colors ${isCopied ? 'text-[#22c55e]' : ''}`}
                                                        >
                                                            <span>🔗</span>
                                                            <span className="max-w-[200px] truncate">{strVal.trim()}</span>
                                                        </a>
                                                    </td>
                                                )
                                            }

                                            return (
                                                <td
                                                    key={col}
                                                    data-selectable-cell
                                                    onMouseDown={(e) => handleMouseDown(rowIdx, colIdx, e)}
                                                    onMouseEnter={() => handleMouseEnter(rowIdx, colIdx)}
                                                    onDoubleClick={handleDblClick}
                                                    className={cellClassName}
                                                    title="双击进行编辑，或拖拽选择区域按 Ctrl+C 复制"
                                                >
                                                    {strVal}
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

export function ResultTable({
    results,
    isSearching,
    tokenId,
    autoLoadImages,
    onImageLoad,
    imageUrlCache,
    onExportSingle,
    modifiedCells,
    updateCell,
    revertChanges,
    saveChanges
}: ResultTableProps) {
    const modifiedCount = modifiedCells ? Object.keys(modifiedCells).length : 0
    const [isSavingLocal, setIsSavingLocal] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    const handleSave = async () => {
        if (!saveChanges) return
        setIsSavingLocal(true)
        setSaveError(null)
        try {
            await saveChanges()
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : '保存失败')
        } finally {
            setIsSavingLocal(false)
        }
    }

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
            {modifiedCount > 0 && (
                <div className="mb-4 p-4 bg-[rgba(234,179,8,0.1)] border border-[#eab308] rounded-lg flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50 backdrop-blur-md">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">⚠️</span>
                        <div>
                            <div className="font-semibold text-[#eab308]">检测到未保存的本地修改</div>
                            <div className="text-xs text-[var(--text-muted)] mt-0.5">
                                您已修改了 {modifiedCount} 个单元格。双击数据格可编辑，或在选中区域按 Ctrl+V 粘贴覆盖。保存前请确认数据行未发生错位。
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {saveError && <span className="text-xs text-red-500 mr-1">{saveError}</span>}
                        <button
                            onClick={revertChanges}
                            disabled={isSavingLocal}
                            className="text-xs px-3 py-1.5 rounded border border-[var(--border)] hover:bg-[rgba(239,68,68,0.1)] hover:text-red-500 hover:border-red-500 transition-colors"
                        >
                            撤销所有修改
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSavingLocal}
                            className="text-xs px-4 py-1.5 rounded bg-[#eab308] hover:bg-[#ca9a06] text-black font-semibold transition-colors flex items-center gap-1.5"
                        >
                            {isSavingLocal ? (
                                <>
                                    <span className="spinner w-3 h-3 border-black border-t-transparent"></span>
                                    正在保存...
                                </>
                            ) : '保存修改到云端 ☁️'}
                        </button>
                    </div>
                </div>
            )}
            
            {results.map((result, index) => (
                <ResultCard
                    key={`${result.tableName}-${index}`}
                    result={result}
                    index={index}
                    tokenId={tokenId}
                    autoLoadImages={autoLoadImages}
                    onImageLoad={onImageLoad}
                    imageUrlCache={imageUrlCache}
                    onExportSingle={onExportSingle}
                    modifiedCells={modifiedCells}
                    updateCell={updateCell}
                />
            ))}
        </div>
    )
}
