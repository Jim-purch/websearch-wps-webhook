'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { TableSearchResult } from '@/hooks/usePartSearch'
import { useTableSelection } from '@/hooks/useTableSelection'
import { BatchEditModal } from './BatchEditModal'

interface ResultTableProps {
    results: TableSearchResult[]
    isSearching: boolean
    searchingTables?: string[]
    tokenId?: string  // 用于获取图片URL
    autoLoadImages?: boolean  // 自动加载图片
    onImageLoad?: (tableName: string, cellAddress: string, url: string) => void // 图片加载回调
    imageUrlCache?: Record<string, string> // 图片缓存
    onExportSingle?: (result: TableSearchResult, selectedRowIndices?: number[]) => void // 导出单个结果的回调
    modifiedCells?: Record<string, any>
    updateCell?: (resultIndex: number, rowIdx: number, columnName: string, newValue: any) => void
    revertChanges?: () => void
    saveChanges?: () => Promise<void>
    onDeleteRows?: (resultIndex: number, rowIndices: number[]) => Promise<void>
    onLoadMore?: (resultIndex: number) => Promise<void> | void // 加载更多回调
    onHideColumn?: (resultIndex: number, columnName: string) => void // 隐藏列回调
    onClearResults?: () => void // 清空搜索结果
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

    const displaySrc = useMemo(() => {
        if (!src) return ''
        const isAbsoluteHttp = src.startsWith('http://') || src.startsWith('https://')
        const isAlreadyProxied = src.includes('/api/image-proxy')
        
        if (isAbsoluteHttp && !isAlreadyProxied) {
            if (typeof window !== 'undefined') {
                if (src.startsWith(window.location.origin)) {
                    return src
                }
            }
            return `/api/image-proxy?url=${encodeURIComponent(src)}`
        }
        return src
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
                    src={displaySrc}
                    alt="大图预览"
                    className="max-w-full max-h-[90vh] object-contain rounded-lg"
                />
                <button
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 text-white hover:bg-black/70 flex items-center justify-center"
                    onClick={(e) => { e.stopPropagation(); setShowPreview(false) }}
                >
                    ✕
                </button>
            </div>
        </div>,
        document.body
    ) : null

    return (
        <div className="relative inline-block group">
            <img
                key={retryCount}
                src={displaySrc}
                alt="图片"
                style={{ maxWidth: IMAGE_THUMBNAIL_SIZE.maxWidth, maxHeight: IMAGE_THUMBNAIL_SIZE.maxHeight }}
                className={`object-contain cursor-pointer rounded border ${isCopied ? 'border-[#22c55e]' : 'border-[var(--border)] hover:border-[#eab308]'} transition-colors`}
                onClick={() => setShowPreview(true)}
                onError={() => setImgError(true)}
                title="点击查看大图"
            />
            <button
                className="absolute top-0.5 right-0.5 p-1 rounded bg-black/60 text-white hover:bg-black/85 opacity-0 group-hover:opacity-100 transition-opacity z-10 text-[10px] flex items-center justify-center w-5 h-5"
                onClick={(e) => { e.stopPropagation(); onCopy() }}
                title={isCopied ? "已复制链接" : "复制图片链接"}
            >
                {isCopied ? "✅" : "📋"}
            </button>
            {previewModal}
        </div>
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
    updateCell,
    onDeleteRows,
    onLoadMore,
    onHideColumn
}: {
    result: TableSearchResult;
    index: number;
    tokenId?: string;
    autoLoadImages?: boolean;
    onImageLoad?: (tableName: string, cellAddress: string, url: string) => void;
    imageUrlCache?: Record<string, string>;
    onExportSingle?: (result: TableSearchResult, selectedRowIndices?: number[]) => void;
    modifiedCells?: Record<string, any>;
    updateCell?: (resultIndex: number, rowIdx: number, columnName: string, newValue: any) => void;
    onDeleteRows?: (resultIndex: number, rowIndices: number[]) => Promise<void>;
    onLoadMore?: (resultIndex: number) => Promise<void> | void;
    onHideColumn?: (resultIndex: number, columnName: string) => void;
}) {
    const [collapsed, setCollapsed] = useState(false)
    const [copiedCell, setCopiedCell] = useState<string | null>(null)
    const [copyToast, setCopyToast] = useState(false)
    const [mounted, setMounted] = useState(false)
    
    // 复选框勾选状态
    const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
    
    // 双击编辑状态
    const [editingCell, setEditingCell] = useState<{ rowIdx: number; colIdx: number } | null>(null)
    const [editValue, setEditValue] = useState('')
    const [isBatchEditModalOpen, setIsBatchEditModalOpen] = useState(false)

    // 是否显示未查找到的行
    const [showNotFoundRows, setShowNotFoundRows] = useState(false)

    // 列宽度和行高度状态
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
    const [rowHeight, setRowHeight] = useState<'default' | 'compact' | 'very-compact'>('compact')
    const resizingRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null)

    // 隐藏的列（本地状态）
    const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())
    // 右键菜单状态
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; column: string } | null>(null)

    // 分页状态（仅在行数超过阈值时启用）
    const PAGINATION_THRESHOLD = 10000
    const PAGE_SIZE = 500
    const needsPagination = (result.records?.length || 0) > PAGINATION_THRESHOLD
    const [currentPage, setCurrentPage] = useState(1)

    const handleResizeStart = useCallback((col: string, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        const thElement = (e.target as HTMLElement).parentElement
        if (!thElement) return
        const startWidth = thElement.getBoundingClientRect().width
        resizingRef.current = {
            col,
            startX: e.clientX,
            startWidth
        }

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (!resizingRef.current) return
            const deltaX = moveEvent.clientX - resizingRef.current.startX
            const newWidth = Math.max(50, resizingRef.current.startWidth + deltaX)
            setColumnWidths(prev => ({
                ...prev,
                [resizingRef.current!.col]: newWidth
            }))
        }

        const handleMouseUp = () => {
            resizingRef.current = null
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
    }, [])

    // 确保在客户端渲染后才使用 Portal
    useEffect(() => {
        setMounted(true)
    }, [])

    // 当结果数据变化时清空选择
    useEffect(() => {
        setSelectedRows(new Set())
    }, [result.records])

    // 构建带未找到行的导出结果（顺序与客户端显示一致），并排除隐藏列
    const buildExportResult = (): TableSearchResult => {
        let baseResult: TableSearchResult = result

        if (showNotFoundRows && result.isBatchSearch && result.allQueryItems) {
            // 按原始查询顺序交错构建记录列表
            const rowsById = new Map<string, Record<string, unknown>[]>()
            for (const rec of records) {
                const id = String(rec._BatchQueryID || '')
                if (!rowsById.has(id)) rowsById.set(id, [])
                rowsById.get(id)!.push(rec)
            }

            const orderedRecords: Record<string, unknown>[] = []
            for (const queryItem of result.allQueryItems) {
                const found = rowsById.get(queryItem.id)
                if (found && found.length > 0) {
                    orderedRecords.push(...found)
                } else {
                    // 未找到的行转为记录格式
                    const rec: Record<string, unknown> = { _BatchQueryID: queryItem.id }
                    for (const [key, val] of Object.entries(queryItem.originalValues)) {
                        rec[`原始_${key}`] = val
                    }
                    orderedRecords.push(rec)
                }
            }

            baseResult = { ...result, records: orderedRecords }
        }

        // 排除隐藏列：从记录中删除隐藏列的字段，使导出时不包含这些列
        if (hiddenColumns.size > 0) {
            const cleanedRecords = baseResult.records.map(rec => {
                const newRec: Record<string, unknown> = { ...rec }
                // 同步处理 fields 对象（多维表格格式）
                if (newRec.fields && typeof newRec.fields === 'object') {
                    newRec.fields = { ...(newRec.fields as Record<string, unknown>) }
                }
                for (const col of hiddenColumns) {
                    delete newRec[col]
                    if (newRec.fields && typeof newRec.fields === 'object') {
                        delete (newRec.fields as Record<string, unknown>)[col]
                    }
                }
                return newRec
            })
            baseResult = { ...baseResult, records: cleanedRecords }
        }

        return baseResult
    }

    const handleBatchExport = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (onExportSingle) {
            onExportSingle(buildExportResult(), Array.from(selectedRows))
        }
    }

    const handleBatchDelete = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!onDeleteRows) return
        
        const confirmDelete = window.confirm(`确定要删除选中的 ${selectedRows.size} 行数据吗？此操作无法撤销。`)
        if (!confirmDelete) return
        
        try {
            await onDeleteRows(index, Array.from(selectedRows))
            setSelectedRows(new Set())
        } catch (err) {
            alert(err instanceof Error ? err.message : '删除失败')
        }
    }

    const handleSingleDelete = async (rowIdx: number) => {
        if (!onDeleteRows) return
        const confirmDelete = window.confirm('确定要删除这一行数据吗？此操作无法撤销。')
        if (!confirmDelete) return
        
        try {
            await onDeleteRows(index, [rowIdx])
            const next = new Set(selectedRows)
            next.delete(rowIdx)
            const adjustedSelected = new Set<number>()
            for (const idx of selectedRows) {
                if (idx < rowIdx) {
                    adjustedSelected.add(idx)
                } else if (idx > rowIdx) {
                    adjustedSelected.add(idx - 1)
                }
            }
            setSelectedRows(adjustedSelected)
        } catch (err) {
            alert(err instanceof Error ? err.message : '删除失败')
        }
    }

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

    // 当结果数据变化或排序变化时重置分页
    useEffect(() => {
        setCurrentPage(1)
    }, [result.records, sortConfig])

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

    // 当 showNotFoundRows 开启时，按原始查询顺序构建交错显示列表
    const renderList = useMemo(() => {
        if (!showNotFoundRows || !result.allQueryItems || !result.isBatchSearch) {
            return rows.map((row, idx) => ({ row, origIdx: idx, isPlaceholder: false as const }))
        }

        // 按 _BatchQueryID 分组找到的记录
        const rowsById = new Map<string, Array<{ row: typeof rows[0]; origIdx: number }>>()
        rows.forEach((row, idx) => {
            const id = String(row._BatchQueryID || '')
            if (!rowsById.has(id)) rowsById.set(id, [])
            rowsById.get(id)!.push({ row, origIdx: idx })
        })

        // 按原始查询顺序交错
        const list: Array<{ row: typeof rows[0] | null; origIdx: number; isPlaceholder: boolean; notFoundItem?: { id: string; originalValues: Record<string, string> } }> = []
        for (const queryItem of result.allQueryItems) {
            const foundEntries = rowsById.get(queryItem.id)
            if (foundEntries && foundEntries.length > 0) {
                for (const entry of foundEntries) {
                    list.push({ row: entry.row, origIdx: entry.origIdx, isPlaceholder: false })
                }
            } else {
                list.push({ row: null, origIdx: -1, isPlaceholder: true, notFoundItem: queryItem })
            }
        }
        return list
    }, [rows, showNotFoundRows, result.allQueryItems, result.isBatchSearch])

    const columns = rows.length > 0
        ? Object.keys(rows[0]).filter(k => k !== 'id' && k !== 'recordId' && k !== '_BatchQueryID')
        : []

    const originalQueryColumns = result.originalQueryColumns || []

    // 优先使用 displayColumns (来自 Step 3 的配置顺序)，如果没有则回退到默认逻辑
    const allDisplayColumns = result.displayColumns && result.displayColumns.length > 0
        ? (hasBatchQueryID
            ? ['_BatchQueryID', ...originalQueryColumns, ...result.displayColumns]
            : result.displayColumns
        )
        : (hasBatchQueryID
            ? ['_BatchQueryID', ...originalQueryColumns, ...columns.filter(c => !originalQueryColumns.includes(c))]
            : columns
        )

    // 过滤掉本地隐藏的列
    const displayColumns = allDisplayColumns.filter(col => !hiddenColumns.has(col))

    // 分页：仅在行数超过阈值时对渲染列表切片
    const totalPages = needsPagination ? Math.max(1, Math.ceil(renderList.length / PAGE_SIZE)) : 1
    const safePage = Math.min(currentPage, totalPages)
    const pageStart = needsPagination ? (safePage - 1) * PAGE_SIZE : 0
    const pageEnd = needsPagination ? pageStart + PAGE_SIZE : renderList.length
    const paginatedRenderList = needsPagination ? renderList.slice(pageStart, pageEnd) : renderList

    const handleBatchEditConfirm = useCallback((columnName: string, newValue: string) => {
        if (!updateCell) return
        selectedRows.forEach(rowIdx => {
            const row = rows[rowIdx]
            if (!row) return
            const val = row[columnName]
            let displayVal = val
            if (val && typeof val === 'object' && !('_type' in val)) {
                displayVal = JSON.stringify(val)
            }
            if (val && typeof val === 'object' && '_type' in val) {
                const imgObj = val as { _type: string; value?: string }
                displayVal = imgObj.value || ''
            }
            const strVal = String(displayVal ?? '')
            if (strVal !== newValue) {
                updateCell(index, rowIdx, columnName, newValue)
            }
        })
        setSelectedRows(new Set())
    }, [index, rows, selectedRows, updateCell])

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

        // 处理 WPS 多维表格附件/图片
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null && ('uploadId' in val[0] || 'tmpUrl' in val[0])) {
            return val.map((a: any) => a.tmpUrl || a.url || a.fileName || '附件').join(', ')
        }
        if (val && typeof val === 'object' && !('_type' in val) && ('uploadId' in val || 'tmpUrl' in val)) {
            const obj = val as any
            return obj.tmpUrl || obj.url || obj.fileName || '附件'
        }

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

    // 隐藏列
    const handleHideColumn = useCallback((col: string) => {
        setHiddenColumns(prev => new Set(prev).add(col))
        setContextMenu(null)
        onHideColumn?.(index, col)
    }, [index, onHideColumn])

    // 右键菜单
    const handleContextMenu = useCallback((e: React.MouseEvent, col: string) => {
        e.preventDefault()
        e.stopPropagation()
        setContextMenu({ x: e.clientX, y: e.clientY, column: col })
    }, [])

    // 点击外部关闭右键菜单
    useEffect(() => {
        if (!contextMenu) return
        const close = () => setContextMenu(null)
        document.addEventListener('click', close)
        document.addEventListener('contextmenu', close)
        return () => {
            document.removeEventListener('click', close)
            document.removeEventListener('contextmenu', close)
        }
    }, [contextMenu])

    if (result.error && records.length === 0) {
        return (
            <div className="card mb-3.5 overflow-hidden">
                <div className="py-2 px-4 bg-[rgba(239,68,68,0.1)] border-b border-[var(--border)]">
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

    const pyClass = rowHeight === 'very-compact' ? 'py-0.5' : rowHeight === 'compact' ? 'py-1' : 'py-2'

    return (
        <div className="card mb-3.5 overflow-hidden">
            <div
                className="py-2 px-4 bg-[rgba(234,179,8,0.1)] border-b border-[var(--border)] cursor-pointer flex justify-between items-center"
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
                        {needsPagination && ' (已分页)'}
                    </span>
                    {result.batchStatus && result.batchStatus.completedBatches < result.batchStatus.totalBatches && (
                        <span className="text-sm text-[#3b82f6] bg-[rgba(59,130,246,0.1)] px-3 py-1 rounded-full flex items-center gap-1.5 animate-pulse">
                            <span className="inline-block w-3 h-3 border-2 border-[#3b82f6]/30 border-t-[#3b82f6] rounded-full animate-spin" />
                            查询中 {result.batchStatus.completedBatches}/{result.batchStatus.totalBatches}
                        </span>
                    )}
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <select
                            value={rowHeight}
                            onChange={(e) => setRowHeight(e.target.value as 'default' | 'compact' | 'very-compact')}
                            className="text-xs px-2 py-1 rounded bg-[var(--card-bg)] border border-[var(--border)] text-[var(--text-main)] hover:border-[#eab308] focus:border-[#eab308] transition-colors outline-none cursor-pointer"
                            title="行高"
                        >
                            <option value="default">较高</option>
                            <option value="compact">紧凑 (默认)</option>
                            <option value="very-compact">非常紧凑</option>
                        </select>
                    </div>
                    {result.isBatchSearch && !(result.batchStatus && result.batchStatus.completedBatches < result.batchStatus.totalBatches) && (() => {
                        const foundIds = new Set(records.map(r => String(r._BatchQueryID || '')))
                        const notFoundCount = (result.allQueryItems || []).filter(item => !foundIds.has(item.id)).length
                        return notFoundCount > 0 ? (
                        <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <label
                            className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] cursor-pointer select-none"
                            title="显示未查找到任何结果的行"
                        >
                            <input
                                type="checkbox"
                                checked={showNotFoundRows}
                                onChange={(e) => setShowNotFoundRows(e.target.checked)}
                                className="cursor-pointer accent-amber-500"
                            />
                            显示未查找到的行 ({notFoundCount})
                        </label>
                        </div>
                        ) : null
                    })()}
                    {onExportSingle && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                onExportSingle(buildExportResult())
                            }}
                            className="btn-export flex items-center gap-1 text-xs"
                            style={{ padding: '4px 10px', height: '26px', borderRadius: '6px' }}
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
                <div className="flex flex-col">
                    {/* 提示与批量操作工具栏（带内边距） */}
                    {(result.error || result.truncated || selectedRows.size > 0) && (
                        <div className="p-4 pb-0 flex flex-col gap-4">
                            {result.error && (
                                <div className="p-3 rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[#ef4444] text-sm flex items-center gap-2">
                                    <span>❌</span>
                                    <span>部分搜索失败: {result.error}</span>
                                </div>
                            )}
                            {result.truncated && (
                                <div className="p-3 rounded-lg bg-[rgba(234,179,8,0.1)] border border-[rgba(234,179,8,0.3)] text-[#eab308] text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <span>⚠️</span>
                                        <span>
                                            搜索结果超过 {result.maxRecords} 行（共 {result.originalTotalCount} 行），仅显示前 {result.records.length} 条。建议使用更精确的搜索条件缩小范围。
                                        </span>
                                    </div>
                                    {onLoadMore && (
                                        <button
                                            type="button"
                                            onClick={() => onLoadMore(index)}
                                            disabled={result.isLoadingMore}
                                            className="text-xs px-3.5 py-2 rounded-lg bg-[var(--card-bg)] border border-[rgba(234,179,8,0.3)] hover:bg-[var(--hover-bg)] text-[#eab308] font-semibold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 select-none shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                                        >
                                            {result.isLoadingMore ? (
                                                <>
                                                    <span className="inline-block animate-spin mr-1">⌛</span>
                                                    正在加载...
                                                </>
                                            ) : (
                                                <>
                                                    <span>⬇️</span>
                                                    加载下 100 条
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            )}
                            {selectedRows.size > 0 && (
                                <div className="px-4 py-2.5 bg-[rgba(234,179,8,0.08)] border border-[rgba(234,179,8,0.2)] rounded-lg flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                                        <span className="text-[#eab308] font-medium">已选中 {selectedRows.size} 行</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {updateCell && (
                                            <button
                                                type="button"
                                                onClick={() => setIsBatchEditModalOpen(true)}
                                                className="text-xs px-3 py-1.5 rounded bg-[var(--card-bg)] border border-[var(--border)] hover:bg-[var(--hover-bg)] text-[var(--text-main)] transition-colors flex items-center gap-1 font-medium cursor-pointer"
                                                title="批量修改选中行的指定字段"
                                            >
                                                <span>✏️</span> 批量修改
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={handleBatchExport}
                                            className="text-xs px-3 py-1.5 rounded bg-[var(--card-bg)] border border-[var(--border)] hover:bg-[var(--hover-bg)] text-[var(--text-main)] transition-colors flex items-center gap-1 font-medium cursor-pointer"
                                            title="导出选中行到 Excel"
                                        >
                                            <span>📤</span> 导出选中行
                                        </button>
                                        {updateCell && onDeleteRows && (
                                            <button
                                                type="button"
                                                onClick={handleBatchDelete}
                                                className="text-xs px-3 py-1.5 rounded bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-[#ef4444] hover:bg-[#ef4444] hover:text-white transition-colors flex items-center gap-1 font-medium cursor-pointer"
                                                title="删除选中行"
                                            >
                                                <span>🗑️</span> 批量删除
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 表格容器（无内边距，实现无缝贴合） */}
                    <div
                        className={`overflow-auto max-h-[600px] ${isSelecting ? 'select-none' : ''}`}
                        {...containerProps}
                    >
                        {renderList.length === 0 ? (
                            <p className="text-center text-[var(--text-muted)] py-8">未找到匹配的数据</p>
                        ) : (
                            <table className="w-full border-collapse text-sm">
                                <thead>
                                    <tr>
                                        <th 
                                            className="sticky top-0 left-0 bg-[var(--table-sticky-bg)] z-50 px-3 py-2 border-b border-[var(--border)] w-10 text-center"
                                            style={{ left: 0 }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={paginatedRenderList.length > 0 && paginatedRenderList.every(item => !item.isPlaceholder && selectedRows.has(item.origIdx))}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        const next = new Set(selectedRows)
                                                        for (const item of paginatedRenderList) {
                                                            if (!item.isPlaceholder) next.add(item.origIdx)
                                                        }
                                                        setSelectedRows(next)
                                                    } else {
                                                        const next = new Set(selectedRows)
                                                        for (const item of paginatedRenderList) {
                                                            if (!item.isPlaceholder) next.delete(item.origIdx)
                                                        }
                                                        setSelectedRows(next)
                                                    }
                                                }}
                                                className="w-4 h-4 rounded border-gray-300 text-[#eab308] focus:ring-[#eab308] cursor-pointer"
                                            />
                                        </th>
                                        {displayColumns.map((col, colIdx) => {
                                            const isFirstDataCol = colIdx === 0;
                                            return (
                                                <th
                                                    key={col}
                                                    onContextMenu={(e) => handleContextMenu(e, col)}
                                                    className={`px-3 py-2 text-left font-semibold text-[var(--text-muted)] border-b border-[var(--border)] whitespace-nowrap group transition-colors select-none ${
                                                        isFirstDataCol
                                                            ? 'sticky top-0 left-10 z-50 bg-[var(--table-sticky-bg)] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)]'
                                                            : 'sticky top-0 bg-[var(--table-sticky-bg)] z-30'
                                                    }`}
                                                    style={{
                                                        width: columnWidths[col] ? `${columnWidths[col]}px` : undefined,
                                                        minWidth: columnWidths[col] ? `${columnWidths[col]}px` : undefined,
                                                        maxWidth: columnWidths[col] ? `${columnWidths[col]}px` : undefined,
                                                        left: isFirstDataCol ? '40px' : undefined,
                                                    }}
                                                >
                                                    <div className="flex items-center gap-1 overflow-hidden pr-2">
                                                        <span
                                                            className="cursor-pointer hover:text-[var(--text-main)] truncate"
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
                                                    {/* 列宽调整手柄 */}
                                                    <div
                                                        className="absolute top-0 right-0 h-full w-2 cursor-col-resize hover:bg-[#eab308]/50 active:bg-[#eab308] z-20 transition-colors"
                                                        onMouseDown={(e) => handleResizeStart(col, e)}
                                                        title="拖拽调整列宽"
                                                    />
                                                </th>
                                            );
                                        })}
                                        <th className="sticky top-0 bg-[var(--table-sticky-bg)] z-30 px-3 py-2 text-left font-semibold text-[var(--text-muted)] border-b border-[var(--border)]">
                                            操作
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedRenderList.map((item, displayIdx) => {
                                        if (item.isPlaceholder) {
                                        return (
                                            <tr key={`nf_${displayIdx}`} className="transition-colors opacity-50">
                                                <td className="sticky left-0 bg-[var(--table-sticky-bg)] z-20 px-3 border-b border-[var(--border)] text-center w-10 text-[var(--text-muted)]" style={{ left: 0 }}>—</td>
                                                {displayColumns.map(col => {
                                                    const nf = item.notFoundItem!
                                                    let val = ''
                                                    if (col === '_BatchQueryID') {
                                                        val = nf.id
                                                    } else {
                                                        const originalKey = col.startsWith('原始_') ? col.slice(3) : col
                                                        val = nf.originalValues[originalKey] ?? ''
                                                    }
                                                    return (
                                                        <td key={col} className="px-3 py-1.5 border-b border-[var(--border)] whitespace-nowrap text-[var(--text-muted)] italic">{val}</td>
                                                    )
                                                })}
                                                <td className="px-3 border-b border-[var(--border)] whitespace-nowrap"></td>
                                            </tr>
                                        )
                                        }
                                        const row = item.row!
                                        const rowIdx = item.origIdx
                                        return (
                                        <tr key={rowIdx} className="transition-colors">
                                            <td 
                                                className={`sticky left-0 bg-[var(--table-sticky-bg)] hover:bg-[var(--hover-bg)] z-20 px-3 ${pyClass} border-b border-[var(--border)] text-center w-10`}
                                                style={{ left: 0 }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedRows.has(rowIdx)}
                                                    onChange={(e) => {
                                                        const next = new Set(selectedRows)
                                                        if (e.target.checked) {
                                                            next.add(rowIdx)
                                                        } else {
                                                            next.delete(rowIdx)
                                                        }
                                                        setSelectedRows(next)
                                                    }}
                                                    className="w-4 h-4 rounded border-gray-300 text-[#eab308] focus:ring-[#eab308] cursor-pointer"
                                                />
                                            </td>
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
                                                let isWpsAttachment = false
                                                let attachments: any[] = []

                                                if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null && ('uploadId' in val[0] || 'tmpUrl' in val[0])) {
                                                    isWpsAttachment = true
                                                    attachments = val
                                                } else if (val && typeof val === 'object' && !('_type' in val)) {
                                                    if ('uploadId' in val || 'tmpUrl' in val) {
                                                        isWpsAttachment = true
                                                        attachments = [val]
                                                    } else {
                                                        displayVal = JSON.stringify(val)
                                                    }
                                                }

                                                if (isWpsAttachment) {
                                                    displayVal = attachments.map(a => a.fileName || '附件').join(', ')
                                                }

                                                if (val && typeof val === 'object' && '_type' in val) {
                                                    const imgObj = val as { _type: string; value?: string }
                                                    displayVal = imgObj.value || ''
                                                }
                                                const strVal = String(displayVal ?? '')

                                                const isFirstDataCol = colIdx === 0
                                                const cellStyle = {
                                                    width: columnWidths[col] ? `${columnWidths[col]}px` : undefined,
                                                    minWidth: columnWidths[col] ? `${columnWidths[col]}px` : undefined,
                                                    maxWidth: columnWidths[col] ? `${columnWidths[col]}px` : undefined,
                                                    left: isFirstDataCol ? '40px' : undefined,
                                                    ...(isFirstDataCol ? {
                                                        background: isSelected
                                                            ? 'linear-gradient(rgba(102,126,234,0.3), rgba(102,126,234,0.3)), var(--table-sticky-bg)'
                                                            : isModified
                                                                ? 'linear-gradient(rgba(234,179,8,0.12), rgba(234,179,8,0.12)), var(--table-sticky-bg)'
                                                                : isCopied
                                                                    ? 'linear-gradient(rgba(34,197,94,0.2), rgba(34,197,94,0.2)), var(--table-sticky-bg)'
                                                                    : undefined
                                                    } : {})
                                                }

                                                // 编辑输入框
                                                if (isEditing) {
                                                    return (
                                                        <td
                                                            key={col}
                                                            className={`px-2 py-1 border-b border-[var(--border)] bg-[rgba(234,179,8,0.05)] ${
                                                                isFirstDataCol ? 'sticky z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)]' : ''
                                                            }`}
                                                            style={cellStyle}
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
                                                    px-3 ${pyClass} border-b border-[var(--border)] cursor-cell transition-colors overflow-hidden text-ellipsis whitespace-nowrap
                                                    ${isFirstDataCol
                                                        ? 'sticky z-10 bg-[var(--table-sticky-bg)] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)]'
                                                        : ''
                                                    }
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

                                                // WPS 附件/图片对象渲染
                                                if (isWpsAttachment && attachments.length > 0) {
                                                    return (
                                                        <td
                                                            key={col}
                                                            data-selectable-cell
                                                            className={cellClassName}
                                                            onMouseDown={(e) => handleMouseDown(rowIdx, colIdx, e)}
                                                            onMouseEnter={() => handleMouseEnter(rowIdx, colIdx)}
                                                            onDoubleClick={handleDblClick}
                                                            style={cellStyle}
                                                        >
                                                            <div className="flex flex-wrap gap-2 items-center">
                                                                {attachments.map((att, idx) => {
                                                                    const url = att.tmpUrl || att.url
                                                                    const isImg = att.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico)(\?.*)?$/i.test(att.fileName || '')
                                                                    
                                                                    if (isImg && url) {
                                                                        return (
                                                                            <ImageWithPreview
                                                                                key={idx}
                                                                                src={url}
                                                                                onCopy={() => handleCellClick(url, cellKey)}
                                                                                isCopied={isCopied}
                                                                            />
                                                                        )
                                                                    }
                                                                    
                                                                    if (url) {
                                                                        return (
                                                                            <a
                                                                                key={idx}
                                                                                href={url}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                className={`inline-flex items-center gap-1 text-[#3b82f6] hover:text-[#60a5fa] hover:underline text-xs bg-[rgba(59,130,246,0.1)] px-2 py-1 rounded max-w-[200px] truncate transition-colors ${isCopied ? 'text-[#22c55e]' : ''}`}
                                                                                title={`点击下载附件: ${att.fileName} (${(att.size / 1024).toFixed(1)} KB)`}
                                                                            >
                                                                                <span>📄</span>
                                                                                <span className="truncate">{att.fileName}</span>
                                                                            </a>
                                                                        )
                                                                    }
                                                                    
                                                                    return (
                                                                        <span
                                                                            key={idx}
                                                                            className="inline-flex items-center gap-1 text-gray-500 text-xs bg-gray-100 dark:bg-neutral-800 px-2 py-1 rounded max-w-[200px] truncate"
                                                                            title={`附件: ${att.fileName} (无法获取下载链接)`}
                                                                        >
                                                                            <span>⚠️</span>
                                                                            <span className="truncate">{att.fileName}</span>
                                                                        </span>
                                                                    )
                                                                })}
                                                            </div>
                                                        </td>
                                                    )
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
                                                                style={cellStyle}
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
                                                                    style={cellStyle}
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
                                                                style={cellStyle}
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
                                                            style={cellStyle}
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
                                                            style={cellStyle}
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
                                                        style={cellStyle}
                                                    >
                                                        {strVal}
                                                    </td>
                                                )
                                            })}
                                            <td className={`px-3 ${pyClass} border-b border-[var(--border)] whitespace-nowrap`}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopyRow(row)}
                                                    className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[#22c55e] hover:border-[#22c55e] hover:text-white transition-colors cursor-pointer"
                                                    title="复制整行"
                                                >
                                                    📋
                                                </button>
                                                {updateCell && onDeleteRows && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleSingleDelete(rowIdx)
                                                        }}
                                                        className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[#ef4444] hover:border-[#ef4444] hover:text-white transition-colors ml-1 cursor-pointer"
                                                        title="删除此行"
                                                    >
                                                        🗑️
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* 分页控件 */}
                    {needsPagination && (
                        <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--border)] bg-[var(--card-bg)] text-sm">
                            <span className="text-[var(--text-muted)]">
                                第 <span className="font-semibold text-[var(--text-main)]">{pageStart + 1}</span> - <span className="font-semibold text-[var(--text-main)]">{Math.min(pageEnd, renderList.length)}</span> 行，共 <span className="font-semibold text-[var(--text-main)]">{renderList.length}</span> 行
                            </span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage(1)}
                                    disabled={safePage <= 1}
                                    className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:bg-[var(--hover-bg)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                    title="第一页"
                                >
                                    ⏮
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={safePage <= 1}
                                    className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:bg-[var(--hover-bg)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                    title="上一页"
                                >
                                    ◀
                                </button>
                                <span className="text-xs text-[var(--text-muted)] px-2">
                                    <span className="font-semibold text-[#eab308]">{safePage}</span> / {totalPages}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={safePage >= totalPages}
                                    className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:bg-[var(--hover-bg)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                    title="下一页"
                                >
                                    ▶
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage(totalPages)}
                                    disabled={safePage >= totalPages}
                                    className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:bg-[var(--hover-bg)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                    title="最后一页"
                                >
                                    ⏭
                                </button>
                                <span className="text-xs text-[var(--text-muted)] ml-1">|</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={totalPages}
                                    value={safePage}
                                    onChange={(e) => {
                                        const v = Number(e.target.value)
                                        if (!isNaN(v) && v >= 1 && v <= totalPages) {
                                            setCurrentPage(v)
                                        }
                                    }}
                                    className="w-14 px-1.5 py-1 text-xs text-center border border-[var(--border)] rounded bg-[var(--card-bg)] text-[var(--text-main)]"
                                    title="跳转到指定页"
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {isBatchEditModalOpen && (
                <BatchEditModal
                    isOpen={isBatchEditModalOpen}
                    onClose={() => setIsBatchEditModalOpen(false)}
                    columns={displayColumns.filter(col => col !== '_BatchQueryID' && col !== '_rowNumber')}
                    selectedCount={selectedRows.size}
                    onConfirm={handleBatchEditConfirm}
                />
            )}

            {/* 右键菜单：隐藏列 */}
            {contextMenu && mounted && createPortal(
                <div
                    className="fixed z-[10000] min-w-[160px] py-1 rounded-lg bg-[var(--card-bg)] border border-[var(--border)] shadow-xl animate-in fade-in zoom-in-95 duration-100"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <button
                        type="button"
                        onClick={() => handleHideColumn(contextMenu.column)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--hover-bg)] transition-colors flex items-center gap-2 text-[var(--text-main)]"
                    >
                        <span>🚫</span>
                        <span>隐藏列「{contextMenu.column === '_BatchQueryID' ? 'QueryID' : contextMenu.column}」</span>
                    </button>
                </div>,
                document.body
            )}

            {/* 隐藏列提示条 */}
            {hiddenColumns.size > 0 && !collapsed && (
                <div className="px-4 py-1.5 border-t border-[var(--border)] flex items-center gap-2 text-xs text-[var(--text-muted)] bg-[var(--hover-bg)]">
                    <span>👁️ 已隐藏 {hiddenColumns.size} 列</span>
                    <button
                        type="button"
                        onClick={() => setHiddenColumns(new Set())}
                        className="text-[#3b82f6] hover:underline font-medium cursor-pointer"
                    >
                        全部显示
                    </button>
                </div>
            )}
        </div>
    )
}

export function ResultTable({
    results,
    isSearching,
    searchingTables = [],
    tokenId,
    autoLoadImages,
    onImageLoad,
    imageUrlCache,
    onExportSingle,
    modifiedCells,
    updateCell,
    revertChanges,
    saveChanges,
    onDeleteRows,
    onLoadMore,
    onHideColumn,
    onClearResults
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

    const isInitialLoading = isSearching && results.length === 0

    return (
        <div>
            {/* 搜索中横幅（稳定结构，不因结果到达而切换 DOM 树） */}
            {isSearching && searchingTables.length > 0 && (
                <div className="mb-4 p-3 bg-[rgba(59,130,246,0.1)] border border-[#3b82f6]/30 rounded-lg flex items-center justify-between gap-3 animate-pulse">
                    <div className="flex items-center gap-2.5">
                        <span className="spinner w-4 h-4 border-[#3b82f6] border-t-transparent"></span>
                        <div className="text-sm text-[var(--text-muted)]">
                            正在搜索数据表：<span className="font-semibold text-blue-500">{searchingTables.join(', ')}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* 初始加载（无结果时的加载占位） */}
            {isInitialLoading ? (
                <div className="card p-8">
                    <div className="flex flex-col items-center justify-center gap-4">
                        <div className="spinner w-10 h-10"></div>
                        <p className="text-[var(--text-muted)] font-semibold">正在搜索数据表...</p>
                    </div>
                </div>
            ) : results.length === 0 && !isSearching ? (
                <div className="card p-8">
                    <div className="text-center text-[var(--text-muted)]">
                        <div className="text-4xl mb-4">📦</div>
                        <p>请按步骤选择 Token、数据表和列，然后输入关键词搜索</p>
                    </div>
                </div>
            ) : (
                <>
            {modifiedCount > 0 && (
                <div className="mb-4 p-4 bg-[rgba(234,179,8,0.15)] border border-[#eab308] rounded-lg flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50">
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
            
            {/* 结果区域工具栏 */}
            {results.length > 0 && onClearResults && (
                <div className="mb-3.5 flex justify-end">
                    <button
                        type="button"
                        onClick={() => {
                            if (window.confirm('确定要清空所有搜索结果吗？')) {
                                onClearResults()
                            }
                        }}
                        disabled={isSearching}
                        className="text-xs px-3.5 py-2 rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[#ef4444] hover:bg-[#ef4444] hover:text-white hover:border-[#ef4444] transition-all cursor-pointer flex items-center gap-1.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span>🗑️</span>
                        清空搜索结果
                    </button>
                </div>
            )}

            {results.map((result, index) => (
                <ResultCard
                    key={`${result.tableName}-${index}`}
                    result={result}
                    index={index}
                    tokenId={result.tokenId || tokenId}
                    autoLoadImages={autoLoadImages}
                    onImageLoad={onImageLoad}
                    imageUrlCache={imageUrlCache}
                    onExportSingle={onExportSingle}
                    modifiedCells={modifiedCells}
                    updateCell={updateCell}
                    onDeleteRows={onDeleteRows}
                    onLoadMore={onLoadMore}
                    onHideColumn={onHideColumn}
                />
            ))}
                </>
            )}
        </div>
    )
}
