'use client'

import { useState, useCallback, useEffect } from 'react'
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

function ResultCard({ result, index, tokenId, autoLoadImages, onImageLoad, imageUrlCache, onExportSingle }: {
    result: TableSearchResult;
    index: number;
    tokenId?: string;
    autoLoadImages?: boolean;
    onImageLoad?: (tableName: string, cellAddress: string, url: string) => void;
    imageUrlCache?: Record<string, string>;
    onExportSingle?: (result: TableSearchResult) => void;
}) {
    const [collapsed, setCollapsed] = useState(false)
    const [copiedCell, setCopiedCell] = useState<string | null>(null)
    const [copyToast, setCopyToast] = useState(false)
    const [mounted, setMounted] = useState(false)

    // 确保在客户端渲染后才使用 Portal
    useEffect(() => {
        setMounted(true)
    }, [])

    const records = result.records || []

    // 处理 WPS 记录格式
    const rows = records.map(record => {
        if (record.fields && typeof record.fields === 'object') {
            const fields = record.fields as Record<string, unknown>
            // 如果是多维表格记录，需要将顶层的批处理元数据（如 _BatchQueryID 和 原始_ 列）合并到 row 对象中
            const row = { ...fields }
            if ('_BatchQueryID' in record) {
                row._BatchQueryID = record._BatchQueryID
            }
            Object.keys(record).forEach(key => {
                if (key.startsWith('原始_')) {
                    row[key] = record[key]
                }
            })
            return row
        }
        return record
    })

    const hasBatchQueryID = records.some(r => '_BatchQueryID' in r)

    const columns = rows.length > 0
        ? Object.keys(rows[0]).filter(k => k !== 'id' && k !== 'recordId' && k !== '_BatchQueryID')
        : []

    const originalQueryColumns = result.originalQueryColumns || []

    // 优先使用 displayColumns (来自 Step 3 的配置顺序)，如果没有则回退到默认逻辑
    // 如果有 displayColumns，只显示其中的列，但在批量查询时保留 QueryID 和 原始查询列
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

            // 优先返回 imageUrl
            if (imgObj.imageUrl) return imgObj.imageUrl

            // 对于 DISPIMG 格式，检查缓存中是否有已加载的图片URL
            if (imgObj._type === 'dispimg' && imgObj.cellAddress && imageUrlCache) {
                const cacheKey = `${result.realTableName || result.tableName}__${imgObj.cellAddress}`
                const cachedUrl = imageUrlCache[cacheKey]
                if (cachedUrl) return cachedUrl
            }

            // 最后才返回 imageId
            if (imgObj.imageId) return imgObj.imageId
        }

        // 处理对象
        if (val && typeof val === 'object') {
            return JSON.stringify(val)
        }

        return String(val ?? '')
    }, [rows, displayColumns, imageUrlCache, result.realTableName, result.tableName])

    // 键盘复制支持 (Ctrl+C / Cmd+C)
    useEffect(() => {
        if (collapsed) return

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selection) {
                e.preventDefault()
                copySelection(getCellText)
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [collapsed, selection, copySelection, getCellText])

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

    // 如果有错误且没有记录，才显示完全失败的状态
    // 如果有记录但有错误（比如批量搜索中途失败），则显示记录并提示错误
    if (result.error && records.length === 0) {
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

            {/* Copy Toast - 使用 Portal 渲染到 body 确保在整个网页顶部中央显示 */}
            {copyToast && mounted && createPortal(
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-lg bg-[#22c55e] text-white text-sm font-medium shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
                    ✓ 已复制到剪贴板
                </div>,
                document.body
            )}

            {/* Body */}
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
                                            className="px-3 py-2 text-left font-semibold text-[var(--text-muted)] border-b border-[var(--border)] whitespace-nowrap cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
                                            onClick={() => selectColumn(colIdx, rows.length)}
                                            title="点击全选此列"
                                        >
                                            {col === '_BatchQueryID' ? 'QueryID' : col}
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

                                            // 检测是否为图片对象 (来自AirScript)
                                            if (val && typeof val === 'object' && '_type' in val) {
                                                const imgObj = val as { _type: string; imageUrl?: string; imageId?: string; value?: string }

                                                // 有图片URL - 直接显示图片
                                                if (imgObj._type === 'image' && imgObj.imageUrl) {
                                                    return (
                                                        <td
                                                            key={col}
                                                            data-selectable-cell
                                                            className={`px-3 py-2 border-b border-[var(--border)] cursor-cell transition-colors ${isSelected
                                                                ? 'bg-[rgba(102,126,234,0.3)]'
                                                                : 'hover:bg-[var(--hover-bg)]'
                                                                }`}
                                                            onMouseDown={(e) => handleMouseDown(rowIdx, colIdx, e)}
                                                            onMouseEnter={() => handleMouseEnter(rowIdx, colIdx)}
                                                        >
                                                            <ImageWithPreview
                                                                src={imgObj.imageUrl}
                                                                onCopy={() => handleCellClick(imgObj.imageUrl!, cellKey)}
                                                                isCopied={isCopied}
                                                            />
                                                        </td>
                                                    )
                                                }

                                                // DISPIMG格式 - 使用懒加载组件获取图片URL
                                                if (imgObj._type === 'dispimg' && imgObj.imageId) {
                                                    const imgObjFull = imgObj as { _type: string; imageId: string; cellAddress?: string; value?: string }

                                                    // 如果有cellAddress和tokenId，使用LazyImageCell自动加载
                                                    if (imgObjFull.cellAddress && tokenId) {
                                                        const cacheKey = `${result.realTableName || result.tableName}__${imgObjFull.cellAddress}`
                                                        const cachedUrl = imageUrlCache?.[cacheKey]

                                                        return (
                                                            <td
                                                                key={col}
                                                                data-selectable-cell
                                                                className={`px-3 py-2 border-b border-[var(--border)] cursor-cell transition-colors ${isSelected
                                                                    ? 'bg-[rgba(102,126,234,0.3)]'
                                                                    : 'hover:bg-[var(--hover-bg)]'
                                                                    }`}
                                                                onMouseDown={(e) => handleMouseDown(rowIdx, colIdx, e)}
                                                                onMouseEnter={() => handleMouseEnter(rowIdx, colIdx)}
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

                                                    // 没有cellAddress时，显示图片ID徽章
                                                    const shortId = imgObj.imageId.length > 16
                                                        ? `${imgObj.imageId.slice(0, 8)}...${imgObj.imageId.slice(-6)}`
                                                        : imgObj.imageId
                                                    return (
                                                        <td
                                                            key={col}
                                                            data-selectable-cell
                                                            className={`px-3 py-2 border-b border-[var(--border)] cursor-cell transition-colors ${isSelected
                                                                ? 'bg-[rgba(102,126,234,0.3)]'
                                                                : 'hover:bg-[var(--hover-bg)]'
                                                                }`}
                                                            onMouseDown={(e) => handleMouseDown(rowIdx, colIdx, e)}
                                                            onMouseEnter={() => handleMouseEnter(rowIdx, colIdx)}
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

                                            // 普通值处理
                                            let displayVal = val
                                            if (val && typeof val === 'object') {
                                                displayVal = JSON.stringify(val)
                                            }
                                            const strVal = String(displayVal ?? '')

                                            // 检测是否为 URL
                                            const urlPattern = /^https?:\/\/[^\s]+$/i
                                            const isUrl = urlPattern.test(strVal.trim())

                                            // 检测是否为图片 URL
                                            const imageExtensions = /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico)(\?.*)?$/i
                                            const isImageUrl = isUrl && imageExtensions.test(strVal.trim())

                                            // 如果是图片 URL 且开启了自动加载图片，则显示图片
                                            if (isImageUrl && autoLoadImages) {
                                                return (
                                                    <td
                                                        key={col}
                                                        data-selectable-cell
                                                        className={`px-3 py-2 border-b border-[var(--border)] cursor-cell transition-colors ${isSelected
                                                            ? 'bg-[rgba(102,126,234,0.3)]'
                                                            : 'hover:bg-[var(--hover-bg)]'
                                                            }`}
                                                        onMouseDown={(e) => handleMouseDown(rowIdx, colIdx, e)}
                                                        onMouseEnter={() => handleMouseEnter(rowIdx, colIdx)}
                                                    >
                                                        <ImageWithPreview
                                                            src={strVal.trim()}
                                                            onCopy={() => handleCellClick(strVal.trim(), cellKey)}
                                                            isCopied={isCopied}
                                                        />
                                                    </td>
                                                )
                                            }

                                            // 如果是普通 URL（非图片或未开启自动加载图片），显示为超链接
                                            if (isUrl) {
                                                return (
                                                    <td
                                                        key={col}
                                                        data-selectable-cell
                                                        onMouseDown={(e) => handleMouseDown(rowIdx, colIdx, e)}
                                                        onMouseEnter={() => handleMouseEnter(rowIdx, colIdx)}
                                                        onDoubleClick={() => handleCellClick(strVal.trim(), cellKey)}
                                                        className={`
                                                            px-3 py-2 border-b border-[var(--border)] cursor-cell transition-colors
                                                            ${isSelected
                                                                ? 'bg-[rgba(102,126,234,0.3)]'
                                                                : isCopied
                                                                    ? 'bg-[rgba(34,197,94,0.2)]'
                                                                    : 'hover:bg-[rgba(234,179,8,0.2)]'
                                                            }
                                                        `}
                                                        title="双击复制链接，单击打开链接，或拖拽选择区域按 Ctrl+C 复制"
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
                                                    onDoubleClick={() => handleCellClick(strVal, cellKey)}
                                                    className={`
                                                        px-3 py-2 border-b border-[var(--border)] cursor-cell transition-colors
                                                        ${isSelected
                                                            ? 'bg-[rgba(102,126,234,0.3)]'
                                                            : isCopied
                                                                ? 'bg-[rgba(34,197,94,0.2)]'
                                                                : 'hover:bg-[rgba(234,179,8,0.2)]'
                                                        }
                                                    `}
                                                    title="双击复制内容，或拖拽选择区域按 Ctrl+C 复制"
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

export function ResultTable({ results, isSearching, tokenId, autoLoadImages, onImageLoad, imageUrlCache, onExportSingle }: ResultTableProps) {
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
                <ResultCard
                    key={`${result.tableName}-${index}`}
                    result={result}
                    index={index}
                    tokenId={tokenId}
                    autoLoadImages={autoLoadImages}
                    onImageLoad={onImageLoad}
                    imageUrlCache={imageUrlCache}
                    onExportSingle={onExportSingle}
                />
            ))}
        </div>
    )
}
