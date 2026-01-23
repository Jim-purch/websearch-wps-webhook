'use client'

import { useState, useCallback, useMemo } from 'react'
import { useTokens } from './useTokens'
import { useSharedTokens } from './useSharedTokens'
import {
    getTableList,
    searchMultiCriteria,
    searchBatch,
    getImageUrls,
    type WpsTable,
    type WpsSearchCriteria,
    type WpsSearchResult,
    type WpsBatchSearchResult,
    type WpsColumn
} from '@/lib/wps'
import type { Token } from '@/types'

export interface SearchCondition {
    tableName: string
    columnName: string
    searchValue: string
    op: 'Contains' | 'Equals'
}

export interface TableSearchResult {
    tableName: string
    realTableName?: string  // 真实表名（用于图片加载等API调用）
    criteriaDescription: string
    records: Record<string, unknown>[]
    totalCount: number
    truncated: boolean
    originalTotalCount?: number | string
    maxRecords?: number
    error?: string
    originalQueryColumns?: string[]  // 原始查询列名称列表
}

const BATCH_SIZE = 50

/**
 * 合并批量查询结果
 */
function mergeBatchResults(prev: TableSearchResult[], newResult: TableSearchResult): TableSearchResult[] {
    const index = prev.findIndex(p => p.tableName === newResult.tableName)
    if (index === -1) {
        return [...prev, newResult]
    }
    const existing = prev[index]

    // 合并记录
    const mergedRecords = [...existing.records, ...newResult.records]

    // 合并原始查询列
    const mergedCols = Array.from(new Set([
        ...(existing.originalQueryColumns || []),
        ...(newResult.originalQueryColumns || [])
    ]))

    const mergedResult: TableSearchResult = {
        ...existing,
        records: mergedRecords,
        totalCount: existing.totalCount + newResult.totalCount,
        // 如果出错，保留之前的错误或新的错误
        error: newResult.error || existing.error,
        originalQueryColumns: mergedCols,
        // 更新描述
        criteriaDescription: `批量查询 (已加载 ${mergedRecords.length} 条数据)`
    }

    const next = [...prev]
    next[index] = mergedResult
    return next
}

/**
 * 清理搜索值：去除回车、空格、"-"、"."，以及最开始的"0"，再转小写
 * 用于对搜索值和被搜索内容都进行标准化处理后再匹配
 */

function cleanValue(value: unknown): string {
    if (value === null || value === undefined) return ''
    return String(value)
        .replace(/[\r\n\s\-\.]/g, '')
        .replace(/^0+/, '')
        .toLowerCase()
}

/**
 * 检查记录是否满足所有搜索条件（对被搜索内容也进行清理后再匹配）
 * 用于多维表格的客户端二次过滤
 */
function matchesAllCriteria(
    record: Record<string, unknown>,
    criteria: WpsSearchCriteria[]
): boolean {
    for (const crit of criteria) {
        // record 可能是 {fields: {...}} 格式（多维表格）或直接的对象（智能表格）
        const fields = (record.fields && typeof record.fields === 'object')
            ? record.fields as Record<string, unknown>
            : record

        const cellValue = fields[crit.columnName]
        const cellValueClean = cleanValue(cellValue)
        const searchValueClean = cleanValue(crit.searchValue)

        if (crit.op === 'Equals') {
            if (cellValueClean !== searchValueClean) return false
        } else {
            // Contains
            if (!cellValueClean.includes(searchValueClean)) return false
        }
    }
    return true
}

export function usePartSearch() {
    const { tokens, isLoading: isLoadingTokens } = useTokens()
    const { isLoading: isLoadingShared, getUsableSharedTokens } = useSharedTokens()

    // 当前选中的 Token
    const [selectedToken, setSelectedToken] = useState<Token | null>(null)

    // 表列表和选中状态
    const [tables, setTables] = useState<WpsTable[]>([])
    const [selectedTableNames, setSelectedTableNames] = useState<Set<string>>(new Set())
    const [isLoadingTables, setIsLoadingTables] = useState(false)
    const [tablesError, setTablesError] = useState<string | null>(null)

    // 列数据 {tableName: columns[]}
    const [columnsData, setColumnsData] = useState<Record<string, WpsColumn[]>>({})
    const [selectedColumns, setSelectedColumns] = useState<Record<string, string[]>>({})

    // 搜索结果
    // 搜索结果
    const [searchResults, setSearchResults] = useState<TableSearchResult[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [searchError, setSearchError] = useState<string | null>(null)

    // 批量搜索状态
    const [isBatchSearching, setIsBatchSearching] = useState(false)
    const [batchProgress, setBatchProgress] = useState<string>('')

    // 导出状态
    const [isExporting, setIsExporting] = useState(false)

    // 图片URL缓存 { "tableName__cellAddress": url }
    const [imageUrlCache, setImageUrlCache] = useState<Record<string, string>>({})

    const handleImageLoad = useCallback((tableName: string, cellAddress: string, url: string) => {
        const key = `${tableName}__${cellAddress}`
        setImageUrlCache(prev => {
            // 如果已经存在且相同，不更新以避免重新渲染
            if (prev[key] === url) return prev
            return { ...prev, [key]: url }
        })
    }, [])

    // 合并自己的 Token 和分享的 Token
    const allTokens = useMemo(() => {
        // 先获取自己的有效 Token
        const ownTokens = tokens.filter(t =>
            t.is_active &&
            t.webhook_url
        )

        // 收集自己 Token 的 ID
        const ownTokenIds = new Set(ownTokens.map(t => t.id))

        // 获取分享的可用 Token（排除自己已拥有的）
        const sharedUsableTokens = getUsableSharedTokens()
            .filter(s => s.token?.webhook_url && !ownTokenIds.has(s.token.id))
            .map(s => ({
                ...s.token!,
                _isShared: true,
                _sharerEmail: s.sharer_email
            } as Token & { _isShared?: boolean; _sharerEmail?: string }))

        return [...ownTokens, ...sharedUsableTokens]
    }, [tokens, getUsableSharedTokens])

    // 选择 Token
    const selectToken = useCallback(async (tokenId: string) => {
        const token = allTokens.find(t => t.id === tokenId)
        if (!token) {
            setSelectedToken(null)
            setTables([])
            setSelectedTableNames(new Set())
            setColumnsData({})
            setSelectedColumns({})
            return
        }

        setSelectedToken(token)
        setTables([])
        setSelectedTableNames(new Set())
        setColumnsData({})
        setSelectedColumns({})
        setSearchResults([])
        setTablesError(null)

        if (!token.webhook_url) {
            setTablesError('此 Token 没有配置 Webhook URL')
            return
        }

        // 加载表列表
        setIsLoadingTables(true)
        try {
            const result = await getTableList(token.id)
            if (result.success && result.data) {
                setTables(result.data)
            } else {
                setTablesError(result.error || '加载表列表失败')
            }
        } catch (err) {
            setTablesError(err instanceof Error ? err.message : '加载表列表失败')
        } finally {
            setIsLoadingTables(false)
        }
    }, [allTokens])

    // 切换表选择
    const toggleTable = useCallback((tableName: string) => {
        setSelectedTableNames(prev => {
            const next = new Set(prev)
            if (next.has(tableName)) {
                next.delete(tableName)
            } else {
                next.add(tableName)
            }
            return next
        })
    }, [])

    // 全选/取消全选表
    const selectAllTables = useCallback(() => {
        setSelectedTableNames(new Set(tables.map(t => t.name)))
    }, [tables])

    const deselectAllTables = useCallback(() => {
        setSelectedTableNames(new Set())
    }, [])

    // 加载选中表的列信息
    const loadColumnsForSelected = useCallback(() => {
        const newColumnsData: Record<string, WpsColumn[]> = {}
        const newSelectedColumns: Record<string, string[]> = {}

        for (const tableName of selectedTableNames) {
            const table = tables.find(t => t.name === tableName)
            if (table && table.columns && table.columns.length > 0) {
                newColumnsData[tableName] = table.columns
                newSelectedColumns[tableName] = []
            }
        }

        setColumnsData(newColumnsData)
        setSelectedColumns(newSelectedColumns)
    }, [selectedTableNames, tables])

    // 切换列选择
    const toggleColumn = useCallback((tableName: string, columnName: string) => {
        setSelectedColumns(prev => {
            const tableColumns = prev[tableName] || []
            const idx = tableColumns.indexOf(columnName)

            const newColumns = idx >= 0
                ? tableColumns.filter(c => c !== columnName)
                : [...tableColumns, columnName]

            return { ...prev, [tableName]: newColumns }
        })
    }, [])

    // 全选/取消全选列
    const selectAllColumns = useCallback(() => {
        const newSelectedColumns: Record<string, string[]> = {}
        for (const [tableKey, columns] of Object.entries(columnsData)) {
            newSelectedColumns[tableKey] = columns.map(c => c.name)
        }
        setSelectedColumns(newSelectedColumns)
    }, [columnsData])

    const deselectAllColumns = useCallback(() => {
        const newSelectedColumns: Record<string, string[]> = {}
        for (const tableKey of Object.keys(columnsData)) {
            newSelectedColumns[tableKey] = []
        }
        setSelectedColumns(newSelectedColumns)
    }, [columnsData])

    // 复制表（用于同一表的不同列搜索）
    const duplicateTable = useCallback((tableKey: string) => {
        // 从 key 中提取真实表名
        const realTableName = tableKey.includes('__copy_') ? tableKey.split('__copy_')[0] : tableKey
        const columns = columnsData[tableKey]
        if (!columns) return

        // 生成新的 key
        const existingKeys = Object.keys(columnsData).filter(k =>
            k === realTableName || k.startsWith(`${realTableName}__copy_`)
        )
        const newKey = `${realTableName}__copy_${existingKeys.length}`

        setColumnsData(prev => ({
            ...prev,
            [newKey]: columns
        }))
        setSelectedColumns(prev => ({
            ...prev,
            [newKey]: []
        }))
    }, [columnsData])

    // 删除复制的表
    const removeTableCopy = useCallback((tableKey: string) => {
        if (!tableKey.includes('__copy_')) return // 不能删除原始表

        setColumnsData(prev => {
            const next = { ...prev }
            delete next[tableKey]
            return next
        })
        setSelectedColumns(prev => {
            const next = { ...prev }
            delete next[tableKey]
            return next
        })
    }, [])

    // 核心搜索逻辑
    const fetchSearchResults = useCallback(async (conditions: SearchCondition[]) => {
        if (!selectedToken?.id || !selectedToken?.webhook_url) {
            throw new Error('Token 配置不完整')
        }

        // 按表分组条件（支持 tableKey 格式，如 tableName__copy_1）
        const conditionsByTableKey: Record<string, { realTableName: string; criteria: WpsSearchCriteria[] }> = {}
        for (const cond of conditions) {
            if (!cond.searchValue.trim()) continue

            // tableName 可能是 "表名" 或 "表名__copy_1" 格式
            const realTableName = cond.tableName.includes('__copy_')
                ? cond.tableName.split('__copy_')[0]
                : cond.tableName

            if (!conditionsByTableKey[cond.tableName]) {
                conditionsByTableKey[cond.tableName] = { realTableName, criteria: [] }
            }
            // 清理搜索值：去除回车、空格、"-"、.、大小写以及最开始的"0"
            const cleanedSearchValue = cleanValue(cond.searchValue)
            if (!cleanedSearchValue) continue

            conditionsByTableKey[cond.tableName].criteria.push({
                columnName: cond.columnName,
                searchValue: cleanedSearchValue,
                op: cond.op
            })
        }

        const tableKeys = Object.keys(conditionsByTableKey)
        if (tableKeys.length === 0) {
            throw new Error('请至少填写一个搜索条件')
        }

        const results: TableSearchResult[] = []

        for (const tableKey of tableKeys) {
            const { realTableName, criteria } = conditionsByTableKey[tableKey]
            const criteriaDesc = criteria
                .map(c => `${c.columnName} ${c.op === 'Contains' ? '包含' : '等于'} "${c.searchValue}"`)
                .join(' AND ')

            // 显示名：如果是复制的表，添加副本标记
            const displayTableName = tableKey.includes('__copy_')
                ? `${realTableName} (副本${tableKey.split('__copy_')[1]})`
                : realTableName

            try {
                const result = await searchMultiCriteria(
                    selectedToken.id,
                    realTableName,
                    criteria
                )

                if (result.success && result.data) {
                    const data = result.data as WpsSearchResult
                    let records = data.records || []

                    // 多维表格使用 WPS API 筛选，无法在服务端修改匹配逻辑
                    // 需要在客户端对返回的结果进行二次过滤（对被搜索内容也进行清理后再匹配）
                    // 判断是否为多维表格：多维表格的记录格式为 {fields: {...}}
                    const isDbSheet = records.length > 0 &&
                        records[0].fields &&
                        typeof records[0].fields === 'object'

                    if (isDbSheet) {
                        // 对多维表格结果进行客户端二次过滤
                        records = records.filter(record => matchesAllCriteria(record, criteria))
                    }

                    results.push({
                        tableName: displayTableName,
                        realTableName: realTableName,
                        criteriaDescription: criteriaDesc,
                        records: records,
                        totalCount: records.length,  // 使用过滤后的数量
                        truncated: data.truncated || false,
                        originalTotalCount: data.originalTotalCount,
                        maxRecords: data.maxRecords
                    })
                } else {
                    results.push({
                        tableName: displayTableName,
                        realTableName: realTableName,
                        criteriaDescription: criteriaDesc,
                        records: [],
                        totalCount: 0,
                        truncated: false,
                        error: result.error || '搜索失败'
                    })
                }
            } catch (err) {
                results.push({
                    tableName: displayTableName,
                    realTableName: realTableName,
                    criteriaDescription: criteriaDesc,
                    records: [],
                    totalCount: 0,
                    truncated: false,
                    error: err instanceof Error ? err.message : '搜索失败'
                })
            }
        }

        return results
    }, [selectedToken])

    // 执行搜索
    const performSearch = useCallback(async (conditions: SearchCondition[]) => {
        setIsSearching(true)
        setSearchError(null)
        setSearchResults([])

        try {
            const results = await fetchSearchResults(conditions)
            setSearchResults(results)
        } catch (err) {
            setSearchError(err instanceof Error ? err.message : '搜索发生错误')
        } finally {
            setIsSearching(false)
        }
    }, [fetchSearchResults])

    // 导出到 Excel (仅导出当前显示的结果)
    const exportToExcel = useCallback(async () => {
        if (searchResults.length === 0) {
            setSearchError('没有可导出的结果，请先执行搜索')
            return
        }

        setIsExporting(true)
        setSearchError(null)

        try {
            const results = searchResults

            // 动态导入 ExcelJS 和 file-saver 以避免 SSR 问题和减少初始包大小
            const ExcelJS = (await import('exceljs')).default
            const { saveAs } = (await import('file-saver'))

            const workbook = new ExcelJS.Workbook()
            let hasData = false

            // 辅助函数：获取图片数据并转换为base64
            async function fetchImageAsBase64(url: string): Promise<{ base64: string; extension: 'png' | 'jpeg' | 'gif' } | null> {
                console.log(`[导出] 开始下载图片: ${url.substring(0, 80)}...`)
                try {
                    // 使用后端代理获取图片，绕过CORS限制
                    const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(url)}`
                    const response = await fetch(proxyUrl)

                    if (!response.ok) {
                        console.error(`[导出] 图片下载失败: HTTP ${response.status} (via proxy)`)
                        return null
                    }

                    const blob = await response.blob()
                    console.log(`[导出] 图片下载成功: ${blob.size} bytes, type: ${blob.type}`)

                    if (blob.size === 0) {
                        console.error(`[导出] 图片大小为0`)
                        return null
                    }

                    const contentType = blob.type
                    let extension: 'png' | 'jpeg' | 'gif' = 'png'
                    if (contentType.includes('jpeg') || contentType.includes('jpg')) {
                        extension = 'jpeg'
                    } else if (contentType.includes('gif')) {
                        extension = 'gif'
                    }

                    const buffer = await blob.arrayBuffer()
                    const base64 = btoa(
                        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                    )

                    console.log(`[导出] Base64转换成功: ${base64.length} chars, extension: ${extension}`)
                    return { base64, extension }
                } catch (err) {
                    console.error(`[导出] 图片下载异常:`, err)
                    return null
                }
            }

            // 检测单元格是否为图片类型
            function isImageCell(value: unknown): { imageUrl?: string; imageId?: string; cellAddress?: string } | null {
                if (value && typeof value === 'object' && '_type' in value) {
                    const obj = value as { _type: string; imageUrl?: string; imageId?: string; cellAddress?: string }
                    if (obj._type === 'image' && obj.imageUrl) {
                        return { imageUrl: obj.imageUrl }
                    }
                    if (obj._type === 'dispimg' && obj.imageId) {
                        return { imageId: obj.imageId, cellAddress: obj.cellAddress }
                    }
                }
                return null
            }

            for (const result of results) {
                if (result.records && result.records.length > 0) {
                    hasData = true
                    // 处理数据，展平字段
                    const flatRecords = result.records.map(r => {
                        if (r.fields && typeof r.fields === 'object') {
                            return r.fields as Record<string, unknown>
                        }
                        return r
                    })

                    // Sheet 名称处理
                    let sheetName = result.tableName.replace(/[\\/?*[\]]/g, '_').substring(0, 31)
                    let counter = 1
                    let finalSheetName = sheetName
                    while (workbook.getWorksheet(finalSheetName)) {
                        finalSheetName = `${sheetName.substring(0, 28)}(${counter})`
                        counter++
                    }

                    const worksheet = workbook.addWorksheet(finalSheetName)

                    if (flatRecords.length > 0) {
                        // 获取所有记录的所有唯一键
                        let allKeys = Array.from(new Set(flatRecords.flatMap(r => Object.keys(r))))

                        // 处理 _BatchQueryID 列：重命名为 QueryID 并放到第一列
                        const hasBatchQueryID = allKeys.includes('_BatchQueryID')
                        if (hasBatchQueryID) {
                            allKeys = allKeys.filter(k => k !== '_BatchQueryID')
                            allKeys.unshift('QueryID')
                        }

                        // 获取原始查询列，并放在 QueryID 后面
                        const originalQueryColumns = result.originalQueryColumns || []
                        if (hasBatchQueryID && originalQueryColumns.length > 0) {
                            allKeys = allKeys.filter(k => !originalQueryColumns.includes(k))
                            allKeys.splice(1, 0, ...originalQueryColumns)
                        }

                        // 检测哪些列包含图片，并收集DISPIMG的cellAddress
                        const imageColumns = new Set<string>()
                        const dispImgCellAddressesToFetch: string[] = []
                        const dispImgCellAddressesCached: string[] = []

                        for (const record of flatRecords) {
                            for (const key of allKeys) {
                                let value = record[key]

                                // 如果是 QueryID 列且原始数据中有 _BatchQueryID，则使用 _BatchQueryID 的值
                                if (key === 'QueryID' && hasBatchQueryID && '_BatchQueryID' in record) {
                                    value = record['_BatchQueryID']
                                }

                                const imgInfo = isImageCell(value)
                                if (imgInfo) {
                                    imageColumns.add(key)
                                    if (imgInfo.cellAddress && !imgInfo.imageUrl) {
                                        // 检查缓存中是否有此图片的URL
                                        const cacheKey = `${result.realTableName || result.tableName}__${imgInfo.cellAddress}`
                                        if (imageUrlCache[cacheKey]) {
                                            dispImgCellAddressesCached.push(imgInfo.cellAddress)
                                        } else {
                                            dispImgCellAddressesToFetch.push(imgInfo.cellAddress)
                                        }
                                    }
                                }
                            }
                        }

                        // 合并图片URL：缓存的 + 新获取的
                        let fetchedImageUrls: Record<string, string | null> = {}

                        // 1. 如果有缓存的URL，先添加
                        if (dispImgCellAddressesCached.length > 0) {
                            console.log(`导出: 使用缓存的 ${dispImgCellAddressesCached.length} 个DISPIMG图片URL`)
                            for (const address of dispImgCellAddressesCached) {
                                const cacheKey = `${result.realTableName || result.tableName}__${address}`
                                fetchedImageUrls[address] = imageUrlCache[cacheKey]
                            }
                        }

                        // 2. 如果有未缓存的DISPIMG单元格，获取图片URL
                        if (dispImgCellAddressesToFetch.length > 0 && selectedToken) {
                            console.log(`导出: 获取 ${dispImgCellAddressesToFetch.length} 个未缓存的DISPIMG图片URL...`)
                            try {
                                const imgResult = await getImageUrls(selectedToken.id, result.realTableName || result.tableName, dispImgCellAddressesToFetch)
                                if (imgResult.success && imgResult.data?.imageUrls) {
                                    Object.assign(fetchedImageUrls, imgResult.data.imageUrls)
                                    console.log(`导出: 成功获取 ${Object.values(imgResult.data.imageUrls).filter(Boolean).length} 个新图片URL`)

                                    // 将新获取的图片URL更新到缓存中，以便前端可以立即显示
                                    const tableName = result.realTableName || result.tableName
                                    for (const [address, url] of Object.entries(imgResult.data.imageUrls)) {
                                        if (url) {
                                            handleImageLoad(tableName, address, url)
                                        }
                                    }
                                }
                            } catch (e) {
                                console.error('导出: 获取图片URL失败', e)
                            }
                        }

                        worksheet.columns = allKeys.map(key => ({
                            header: key,
                            key: key,
                            width: imageColumns.has(key) ? 15 : 20 // 图片列稍窄
                        }))

                        // 添加数据行，但先处理非图片数据
                        const imagePositions: Array<{ row: number; col: number; url: string }> = []

                        for (let rowIdx = 0; rowIdx < flatRecords.length; rowIdx++) {
                            const record = flatRecords[rowIdx]
                            const rowData: Record<string, unknown> = {}

                            for (let colIdx = 0; colIdx < allKeys.length; colIdx++) {
                                const key = allKeys[colIdx]
                                let value = record[key]

                                // 如果是 QueryID 列且原始数据中有 _BatchQueryID，则使用 _BatchQueryID 的值
                                if (key === 'QueryID' && hasBatchQueryID && '_BatchQueryID' in record) {
                                    value = record['_BatchQueryID']
                                }

                                const imgInfo = isImageCell(value)

                                if (imgInfo?.imageUrl) {
                                    // 已有图片URL - 直接使用
                                    imagePositions.push({
                                        row: rowIdx + 2, // +2 因为第1行是表头
                                        col: colIdx + 1,
                                        url: imgInfo.imageUrl
                                    })
                                    rowData[key] = '' // 留空，图片会覆盖
                                } else if (imgInfo?.cellAddress && fetchedImageUrls[imgInfo.cellAddress]) {
                                    // DISPIMG且成功获取到URL
                                    imagePositions.push({
                                        row: rowIdx + 2,
                                        col: colIdx + 1,
                                        url: fetchedImageUrls[imgInfo.cellAddress]!
                                    })
                                    rowData[key] = '' // 留空，图片会覆盖
                                } else if (imgInfo?.imageId) {
                                    rowData[key] = `[图片: ${imgInfo.imageId}]` // 无法获取URL，显示ID
                                } else {
                                    rowData[key] = value
                                }
                            }
                            worksheet.addRow(rowData)
                        }

                        // 设置图片行的高度
                        if (imageColumns.size > 0) {
                            for (let rowIdx = 2; rowIdx <= flatRecords.length + 1; rowIdx++) {
                                worksheet.getRow(rowIdx).height = 50 // 图片行高度
                            }
                        }

                        // 下载并嵌入图片
                        // 下载并嵌入图片
                        console.log(`[导出] 开始处理 ${imagePositions.length} 个图片位置 (并发数: 5)`)
                        let embeddedCount = 0

                        // 并发控制函数
                        const CONCURRENCY = 5
                        const processImage = async (pos: { row: number; col: number; url: string }) => {
                            console.log(`[导出] 处理图片位置: 行${pos.row}, 列${pos.col}, URL: ${pos.url.substring(0, 40)}...`)
                            const imgData = await fetchImageAsBase64(pos.url)
                            if (imgData) {
                                try {
                                    const imageId = workbook.addImage({
                                        base64: imgData.base64,
                                        extension: imgData.extension
                                    })
                                    // 使用单元格范围格式 (列从0开始计数)
                                    const colLetter = String.fromCharCode(64 + pos.col) // 1->A, 2->B, etc.
                                    const cellRange = `${colLetter}${pos.row}:${colLetter}${pos.row}`

                                    // 注意: worksheet操作通常是同步的，但在Promise中需要确保顺序安全性（JS是单线程的，所以这里是安全的，只要exceljs内部没有异步状态竞争）
                                    worksheet.addImage(imageId, cellRange as `${string}:${string}`)
                                    embeddedCount++
                                } catch (embedErr) {
                                    console.error(`[导出] 嵌入图片失败:`, embedErr)
                                }
                            }
                        }

                        //创建一个简单的并发处理器
                        const queue = [...imagePositions]
                        const workers = Array(Math.min(CONCURRENCY, queue.length))
                            .fill(null)
                            .map(async () => {
                                while (queue.length > 0) {
                                    const pos = queue.shift()
                                    if (pos) {
                                        await processImage(pos)
                                    }
                                }
                            })

                        await Promise.all(workers)

                        console.log(`[导出] 成功嵌入 ${embeddedCount}/${imagePositions.length} 个图片`)
                    }
                }
            }

            if (!hasData) {
                setSearchError('没有可导出的数据')
                return
            }

            // 导出文件
            const buffer = await workbook.xlsx.writeBuffer()
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
            saveAs(blob, `搜索结果_${new Date().toISOString().slice(0, 10)}.xlsx`)
        } catch (err) {
            console.error('Export error:', err)
            setSearchError(err instanceof Error ? err.message : '导出发生错误')
        } finally {
            setIsExporting(false)
        }
    }, [searchResults, selectedToken, imageUrlCache, handleImageLoad])

    // 导出单个结果到 Excel
    const exportSingleResult = useCallback(async (result: TableSearchResult) => {
        if (!result.records || result.records.length === 0) {
            setSearchError('没有可导出的数据')
            return
        }

        try {
            const ExcelJS = (await import('exceljs')).default
            const { saveAs } = (await import('file-saver'))

            const workbook = new ExcelJS.Workbook()

            // 处理数据，展平字段
            const flatRecords = result.records.map(r => {
                if (r.fields && typeof r.fields === 'object') {
                    return r.fields as Record<string, unknown>
                }
                return r
            })

            // Sheet 名称处理
            let sheetName = result.tableName.replace(/[\\/?*[\]]/g, '_').substring(0, 31)

            const worksheet = workbook.addWorksheet(sheetName)

            // 获取所有记录的所有唯一键
            let allKeys = Array.from(new Set(flatRecords.flatMap(r => Object.keys(r))))

            // 处理 _BatchQueryID 列：重命名为 QueryID 并放到第一列
            const hasBatchQueryID = allKeys.includes('_BatchQueryID')
            if (hasBatchQueryID) {
                allKeys = allKeys.filter(k => k !== '_BatchQueryID')
                allKeys.unshift('QueryID')
            }

            // 获取原始查询列，并放在 QueryID 后面
            const originalQueryColumns = result.originalQueryColumns || []
            if (hasBatchQueryID && originalQueryColumns.length > 0) {
                allKeys = allKeys.filter(k => !originalQueryColumns.includes(k))
                allKeys.splice(1, 0, ...originalQueryColumns)
            }

            // 辅助函数：获取图片数据并转换为base64
            async function fetchImageAsBase64(url: string): Promise<{ base64: string; extension: 'png' | 'jpeg' | 'gif' } | null> {
                try {
                    const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(url)}`
                    const response = await fetch(proxyUrl)

                    if (!response.ok) {
                        return null
                    }

                    const blob = await response.blob()
                    if (blob.size === 0) {
                        return null
                    }

                    const contentType = blob.type
                    let extension: 'png' | 'jpeg' | 'gif' = 'png'
                    if (contentType.includes('jpeg') || contentType.includes('jpg')) {
                        extension = 'jpeg'
                    } else if (contentType.includes('gif')) {
                        extension = 'gif'
                    }

                    const buffer = await blob.arrayBuffer()
                    const base64 = btoa(
                        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                    )

                    return { base64, extension }
                } catch (err) {
                    return null
                }
            }

            // 检测单元格是否为图片类型
            function isImageCell(value: unknown): { imageUrl?: string; imageId?: string; cellAddress?: string } | null {
                if (value && typeof value === 'object' && '_type' in value) {
                    const obj = value as { _type: string; imageUrl?: string; imageId?: string; cellAddress?: string }
                    if (obj._type === 'image' && obj.imageUrl) {
                        return { imageUrl: obj.imageUrl }
                    }
                    if (obj._type === 'dispimg' && obj.imageId) {
                        return { imageId: obj.imageId, cellAddress: obj.cellAddress }
                    }
                }
                return null
            }

            // 检测哪些列包含图片，并收集DISPIMG的cellAddress
            const imageColumns = new Set<string>()
            const dispImgCellAddressesToFetch: string[] = []
            const dispImgCellAddressesCached: string[] = []

            for (const record of flatRecords) {
                for (const key of allKeys) {
                    const imgInfo = isImageCell(record[key])
                    if (imgInfo) {
                        imageColumns.add(key)
                        if (imgInfo.cellAddress && !imgInfo.imageUrl) {
                            const cacheKey = `${result.realTableName || result.tableName}__${imgInfo.cellAddress}`
                            if (imageUrlCache[cacheKey]) {
                                dispImgCellAddressesCached.push(imgInfo.cellAddress)
                            } else {
                                dispImgCellAddressesToFetch.push(imgInfo.cellAddress)
                            }
                        }
                    }
                }
            }

            // 合并图片URL：缓存的 + 新获取的
            let fetchedImageUrls: Record<string, string | null> = {}

            if (dispImgCellAddressesCached.length > 0) {
                for (const address of dispImgCellAddressesCached) {
                    const cacheKey = `${result.realTableName || result.tableName}__${address}`
                    fetchedImageUrls[address] = imageUrlCache[cacheKey]
                }
            }

            if (dispImgCellAddressesToFetch.length > 0 && selectedToken) {
                try {
                    const imgResult = await getImageUrls(selectedToken.id, result.realTableName || result.tableName, dispImgCellAddressesToFetch)
                    if (imgResult.success && imgResult.data?.imageUrls) {
                        Object.assign(fetchedImageUrls, imgResult.data.imageUrls)

                        // 将新获取的图片URL更新到缓存中，以便前端可以立即显示
                        const tableName = result.realTableName || result.tableName
                        for (const [address, url] of Object.entries(imgResult.data.imageUrls)) {
                            if (url) {
                                handleImageLoad(tableName, address, url)
                            }
                        }
                    }
                } catch (e) {
                    console.error('导出: 获取图片URL失败', e)
                }
            }

            worksheet.columns = allKeys.map(key => ({
                header: key,
                key: key,
                width: imageColumns.has(key) ? 15 : 20
            }))

            // 添加数据行
            const imagePositions: Array<{ row: number; col: number; url: string }> = []

            for (let rowIdx = 0; rowIdx < flatRecords.length; rowIdx++) {
                const record = flatRecords[rowIdx]
                const rowData: Record<string, unknown> = {}

                for (let colIdx = 0; colIdx < allKeys.length; colIdx++) {
                    const key = allKeys[colIdx]
                    let value = record[key]

                    // 如果是 QueryID 列且原始数据中有 _BatchQueryID，则使用 _BatchQueryID 的值
                    if (key === 'QueryID' && hasBatchQueryID && '_BatchQueryID' in record) {
                        value = record['_BatchQueryID']
                    }

                    const imgInfo = isImageCell(value)

                    if (imgInfo?.imageUrl) {
                        imagePositions.push({
                            row: rowIdx + 2,
                            col: colIdx + 1,
                            url: imgInfo.imageUrl
                        })
                        rowData[key] = ''
                    } else if (imgInfo?.cellAddress && fetchedImageUrls[imgInfo.cellAddress]) {
                        imagePositions.push({
                            row: rowIdx + 2,
                            col: colIdx + 1,
                            url: fetchedImageUrls[imgInfo.cellAddress]!
                        })
                        rowData[key] = ''
                    } else if (imgInfo?.imageId) {
                        rowData[key] = `[图片: ${imgInfo.imageId}]`
                    } else {
                        rowData[key] = value
                    }
                }
                worksheet.addRow(rowData)
            }

            // 设置图片行的高度
            if (imageColumns.size > 0) {
                for (let rowIdx = 2; rowIdx <= flatRecords.length + 1; rowIdx++) {
                    worksheet.getRow(rowIdx).height = 50
                }
            }

            // 下载并嵌入图片
            const CONCURRENCY = 5
            const processImage = async (pos: { row: number; col: number; url: string }) => {
                const imgData = await fetchImageAsBase64(pos.url)
                if (imgData) {
                    try {
                        const imageId = workbook.addImage({
                            base64: imgData.base64,
                            extension: imgData.extension
                        })
                        const colLetter = String.fromCharCode(64 + pos.col)
                        const cellRange = `${colLetter}${pos.row}:${colLetter}${pos.row}`
                        worksheet.addImage(imageId, cellRange as `${string}:${string}`)
                    } catch (embedErr) {
                        console.error(`[导出] 嵌入图片失败:`, embedErr)
                    }
                }
            }

            const queue = [...imagePositions]
            const workers = Array(Math.min(CONCURRENCY, queue.length))
                .fill(null)
                .map(async () => {
                    while (queue.length > 0) {
                        const pos = queue.shift()
                        if (pos) {
                            await processImage(pos)
                        }
                    }
                })

            await Promise.all(workers)

            // 生成文件名：表名_查询条件
            const criteriaText = result.criteriaDescription
                .replace(/包含|等于/g, '')
                .replace(/"/g, '')
                .replace(/\s+/g, '_')
                .substring(0, 50)

            const fileName = `${result.tableName}_${criteriaText}.xlsx`

            // 导出文件
            const buffer = await workbook.xlsx.writeBuffer()
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
            saveAs(blob, fileName)
        } catch (err) {
            console.error('Export single result error:', err)
            setSearchError(err instanceof Error ? err.message : '导出发生错误')
        }
    }, [selectedToken, imageUrlCache, handleImageLoad])

    // 下载批量查询模板 (多 Sheet 模式)
    const downloadBatchTemplate = useCallback(async () => {
        if (!Object.values(selectedColumns).some(cols => cols.length > 0)) {
            setSearchError('请先选择至少一个表和列')
            return
        }

        try {
            const ExcelJS = (await import('exceljs')).default
            const { saveAs } = (await import('file-saver'))
            const workbook = new ExcelJS.Workbook()

            // 遍历所有选中的表，为每个表创建一个 Sheet
            for (const [tableKey, columns] of Object.entries(selectedColumns)) {
                if (columns.length === 0) continue

                // 处理 Sheet 名称 (Excel 限制 31 字符，且不能包含特殊字符)
                // tableKey 可能包含 __copy_ 后缀，我们尽量保留
                let sheetName = tableKey.replace(/[:\\/?*[\]]/g, '_').substring(0, 31)

                // 确保 sheet 名唯一
                let counter = 1
                const originalSheetName = sheetName
                while (workbook.getWorksheet(sheetName)) {
                    // 如果重复，截断并添加序号
                    const suffix = `_${counter}`
                    sheetName = `${originalSheetName.substring(0, 31 - suffix.length)}${suffix}`
                    counter++
                }

                const worksheet = workbook.addWorksheet(sheetName)

                // 第一列必须是 Query_ID
                const headers = ['Query_ID', ...columns]

                // 设置表头
                worksheet.addRow(headers)

                // 添加元数据到第一行（隐藏），用于上传时准确匹配 tableKey
                // 或者我们可以简单地依靠 Sheet Name 匹配（如果用户没改名）
                // 为了稳健，我们在 A1 单元格的批注或隐藏行中存储完整的 tableKey 比较复杂
                // 简单的做法：主要依赖 Sheet 名匹配，同时在解析时尝试模糊匹配

                // 添加示例行
                const exampleRow = ['row_1']
                for (let i = 0; i < columns.length; i++) {
                    exampleRow.push('')
                }
                worksheet.addRow(exampleRow)

                // 设置列宽
                worksheet.columns = headers.map(h => ({ header: h, key: h, width: 20 }))
            }

            if (workbook.worksheets.length === 0) {
                setSearchError('没有可生成的模板内容')
                return
            }

            const buffer = await workbook.xlsx.writeBuffer()
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
            saveAs(blob, `批量查询模板_${new Date().toISOString().slice(0, 10)}.xlsx`)

        } catch (err) {
            console.error('Template download error:', err)
            setSearchError('下载模板失败')
        }
    }, [selectedColumns])

    // 执行批量搜索 (解析 多 Sheet Excel -> 分批调用 API -> 增量更新结果)
    const performBatchSearch = useCallback(async (file: File, matchMode: 'fuzzy' | 'exact' = 'exact') => {
        if (!selectedToken?.id || !selectedToken?.webhook_url) {
            setSearchError('Token 配置不完整')
            return
        }

        setIsBatchSearching(true)
        setBatchProgress('正在解析文件...')
        setSearchError(null)
        setSearchResults([]) // 清空旧结果

        try {
            const ExcelJS = (await import('exceljs')).default
            const workbook = new ExcelJS.Workbook()
            await workbook.xlsx.load(await file.arrayBuffer())

            const batchRequests: Record<string, { realTableName: string, items: Array<{ id: string, criteria: WpsSearchCriteria[], originalValues: Record<string, string> }> }> = {}

            // 遍历 Excel 中的所有 Sheet
            workbook.eachSheet((worksheet, sheetId) => {
                const sheetName = worksheet.name

                // 1. 匹配表名 (Table Key)
                let matchedTableKey: string | null = null
                for (const tableKey of Object.keys(selectedColumns)) {
                    const generatedName = tableKey.replace(/[:\\/?*[\]]/g, '_').substring(0, 31)
                    if (generatedName === sheetName) {
                        matchedTableKey = tableKey
                        break
                    }
                }
                if (!matchedTableKey) {
                    for (const tableKey of Object.keys(selectedColumns)) {
                        const safeKeyStart = tableKey.replace(/[:\\/?*[\]]/g, '_').substring(0, 20)
                        if (sheetName.startsWith(safeKeyStart)) {
                            matchedTableKey = tableKey
                            break
                        }
                    }
                }

                if (!matchedTableKey) {
                    console.warn(`Skipping sheet "${sheetName}": No matching table found in current selection.`)
                    return
                }

                const tableKey = matchedTableKey

                // 2. 解析表头
                const headerRow = worksheet.getRow(1)
                const colIndexToField: Record<number, string> = {}

                headerRow.eachCell((cell, colNumber) => {
                    const val = (cell.value?.toString() || '').trim()
                    if (val === 'Query_ID') {
                        colIndexToField[colNumber] = 'Query_ID'
                    } else if (selectedColumns[tableKey]?.includes(val)) {
                        colIndexToField[colNumber] = val
                    }
                })

                if (Object.keys(colIndexToField).length <= 1) return

                // 3. 读取数据行
                const realTableName = tableKey.includes('__copy_') ? tableKey.split('__copy_')[0] : tableKey
                if (!batchRequests[tableKey]) {
                    batchRequests[tableKey] = { realTableName, items: [] }
                }

                worksheet.eachRow((row, rowNumber) => {
                    if (rowNumber === 1) return

                    // 获取 QueryID
                    const idColNum = parseInt(Object.keys(colIndexToField).find(k => colIndexToField[parseInt(k)] === 'Query_ID') || '0')
                    const rowId = idColNum ? (row.getCell(idColNum).value?.toString() || `row_${rowNumber}`) : `row_${rowNumber}`

                    const criteria: WpsSearchCriteria[] = []
                    const originalValues: Record<string, string> = {}

                    row.eachCell((cell, colNumber) => {
                        const fieldName = colIndexToField[colNumber]
                        if (!fieldName || fieldName === 'Query_ID') return

                        let val = ''
                        const unsafeCell = cell as any
                        if ('text' in unsafeCell) {
                            val = unsafeCell.text || ''
                        } else {
                            val = cell.value?.toString() || ''
                        }

                        let cleanVal = val.replace(/[\r\n]+/g, '').trim()
                        if (cleanVal === '') return

                        originalValues[fieldName] = cleanVal

                        // 清理搜索值
                        const searchValueCleaned = cleanValue(cleanVal)

                        if (searchValueCleaned) {
                            criteria.push({
                                columnName: fieldName,
                                searchValue: searchValueCleaned,
                                op: matchMode === 'exact' ? 'Equals' : 'Contains'
                            })
                        }
                    })

                    if (criteria.length > 0) {
                        batchRequests[tableKey].items.push({
                            id: rowId,
                            criteria,
                            originalValues
                        })
                    }
                })
            })

            const tableKeys = Object.keys(batchRequests)
            if (tableKeys.length === 0) {
                setSearchError('未解析到有效的查询数据，请检查上传文件和当前选中的表是否匹配')
            }

            // 计算总条数 (所有表的总和)
            const totalItemsCount = tableKeys.reduce((sum, key) => sum + batchRequests[key].items.length, 0)
            let processedItemsCount = 0

            // 4. 执行分批查询
            for (let i = 0; i < tableKeys.length; i++) {
                const tableKey = tableKeys[i]
                const { realTableName, items } = batchRequests[tableKey]
                if (items.length === 0) continue

                const displayTableName = tableKey.includes('__copy_')
                    ? `${realTableName} (副本${tableKey.split('__copy_')[1]})`
                    : realTableName

                // 将 items 分批
                const chunkedItems = []
                for (let j = 0; j < items.length; j += BATCH_SIZE) {
                    chunkedItems.push(items.slice(j, j + BATCH_SIZE))
                }

                for (let chunkIdx = 0; chunkIdx < chunkedItems.length; chunkIdx++) {
                    const chunk = chunkedItems[chunkIdx]
                    const currentBatchSize = chunk.length

                    // 更新进度
                    setBatchProgress(`查询中(${processedItemsCount + currentBatchSize}/${totalItemsCount})`)

                    try {
                        const originalQueryColumns = Array.from(new Set(chunk.flatMap(item => Object.keys(item.originalValues).map(k => `原始_${k}`))))

                        const res = await searchBatch(selectedToken.id, realTableName, chunk)

                        let newResult: TableSearchResult

                        if (res.success && res.data) {
                            const batchRes = res.data as WpsBatchSearchResult
                            const allRecords: Record<string, unknown>[] = []

                            for (const itemResult of batchRes.results) {
                                if (itemResult.success && itemResult.records) {
                                    const item = chunk.find(i => i.id === itemResult.id)
                                    const originalValues = item?.originalValues || {}
                                    const prefixedOriginalValues: Record<string, string> = {}
                                    for (const [key, value] of Object.entries(originalValues)) {
                                        prefixedOriginalValues[`原始_${key}`] = value
                                    }
                                    const recordsWithId = itemResult.records.map(r => ({
                                        ...r,
                                        _BatchQueryID: itemResult.id,
                                        ...prefixedOriginalValues
                                    }))
                                    allRecords.push(...recordsWithId)
                                }
                            }

                            newResult = {
                                tableName: displayTableName,
                                realTableName: realTableName,
                                criteriaDescription: `批量查询`, // 会在 merge 中更新
                                records: allRecords,
                                totalCount: allRecords.length,
                                truncated: false,
                                error: undefined,
                                originalQueryColumns
                            }
                        } else {
                            newResult = {
                                tableName: displayTableName,
                                realTableName: realTableName,
                                criteriaDescription: '批量查询失败',
                                records: [],
                                totalCount: 0,
                                truncated: false,
                                error: res.error || 'API 调用失败'
                            }
                        }

                        // 增量更新 State
                        setSearchResults(prev => mergeBatchResults(prev, newResult))

                    } catch (err) {
                        const errorResult: TableSearchResult = {
                            tableName: displayTableName,
                            realTableName: realTableName,
                            criteriaDescription: '批量查询异常',
                            records: [],
                            totalCount: 0,
                            truncated: false,
                            error: err instanceof Error ? err.message : '未知错误'
                        }
                        setSearchResults(prev => mergeBatchResults(prev, errorResult))
                    } finally {
                        processedItemsCount += currentBatchSize
                        // 更新进度
                        setBatchProgress(`查询中(${Math.min(processedItemsCount, totalItemsCount)}/${totalItemsCount})`)
                    }
                }
            }

            setBatchProgress('')

        } catch (err) {
            console.error('Batch search error:', err)
            setSearchError(err instanceof Error ? err.message : '批量搜索发生错误')
        } finally {
            setIsBatchSearching(false)
            setBatchProgress('')
        }
    }, [selectedToken, selectedColumns])

    // 执行粘贴查询 (从粘贴的数据进行批量搜索)
    const performPasteSearch = useCallback(async (
        tableKey: string,
        data: Array<{ id: string; values: Record<string, string> }>,
        matchMode: 'fuzzy' | 'exact' = 'exact'
    ) => {
        if (!selectedToken?.id || !selectedToken?.webhook_url) {
            setSearchError('Token 配置不完整')
            return
        }

        if (data.length === 0) {
            setSearchError('没有要查询的数据')
            return
        }

        setIsBatchSearching(true)
        setBatchProgress('准备查询...')
        setSearchError(null)
        setSearchResults([])

        try {
            const realTableName = tableKey.includes('__copy_')
                ? tableKey.split('__copy_')[0]
                : tableKey

            const displayTableName = tableKey.includes('__copy_')
                ? `${realTableName} (副本${tableKey.split('__copy_')[1]})`
                : realTableName

            // 构建所有查询项
            const allItems = data.map(row => {
                const criteria: WpsSearchCriteria[] = []
                const originalValues: Record<string, string> = {}

                for (const [columnName, value] of Object.entries(row.values)) {
                    if (!value || !value.trim()) continue

                    originalValues[columnName] = value.trim()
                    const searchValueCleaned = cleanValue(value)

                    if (searchValueCleaned) {
                        criteria.push({
                            columnName,
                            searchValue: searchValueCleaned,
                            op: matchMode === 'exact' ? 'Equals' : 'Contains'
                        })
                    }
                }

                return { id: row.id, criteria, originalValues }
            }).filter(item => item.criteria.length > 0)

            if (allItems.length === 0) {
                setSearchError('没有有效的查询条件')
                setIsBatchSearching(false)
                return
            }

            // 分批处理
            const chunkedItems = []
            for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
                chunkedItems.push(allItems.slice(i, i + BATCH_SIZE))
            }

            let processedCount = 0
            const totalCount = allItems.length

            for (let chunkIdx = 0; chunkIdx < chunkedItems.length; chunkIdx++) {
                const chunk = chunkedItems[chunkIdx]
                const currentBatchSize = chunk.length

                // 更新进度
                setBatchProgress(`查询中(${processedCount + currentBatchSize}/${totalCount})`)

                const originalQueryColumns = Array.from(
                    new Set(chunk.flatMap(item => Object.keys(item.originalValues).map(k => `原始_${k}`)))
                )

                const res = await searchBatch(selectedToken.id, realTableName, chunk)

                let newResult: TableSearchResult

                if (res.success && res.data) {
                    const batchRes = res.data as WpsBatchSearchResult
                    const allRecords: Record<string, unknown>[] = []

                    for (const itemResult of batchRes.results) {
                        if (itemResult.success && itemResult.records) {
                            const item = chunk.find(i => i.id === itemResult.id)
                            const itemCriteria = item?.criteria || []
                            const originalValues = item?.originalValues || {}
                            const prefixedOriginalValues: Record<string, string> = {}
                            for (const [key, value] of Object.entries(originalValues)) {
                                prefixedOriginalValues[`原始_${key}`] = value
                            }

                            // 客户端二次过滤
                            let filteredRecords = itemResult.records
                            const isDbSheet = filteredRecords.length > 0 &&
                                filteredRecords[0].fields &&
                                typeof filteredRecords[0].fields === 'object'

                            if (isDbSheet) {
                                filteredRecords = filteredRecords.filter(record =>
                                    matchesAllCriteria(record as Record<string, unknown>, itemCriteria)
                                )
                            }

                            const recordsWithId = filteredRecords.map(r => ({
                                ...r,
                                _BatchQueryID: itemResult.id,
                                ...prefixedOriginalValues
                            }))
                            allRecords.push(...recordsWithId)
                        }
                    }

                    newResult = {
                        tableName: displayTableName,
                        realTableName: realTableName,
                        criteriaDescription: `粘贴查询`, // 会在 merge 中更新
                        records: allRecords,
                        totalCount: allRecords.length,
                        truncated: false,
                        error: undefined,
                        originalQueryColumns
                    }
                } else {
                    newResult = {
                        tableName: displayTableName,
                        realTableName: realTableName,
                        criteriaDescription: '粘贴查询失败',
                        records: [],
                        totalCount: 0,
                        truncated: false,
                        error: res.error || 'API 调用失败'
                    }
                }

                // 增量更新 SearchResults
                setSearchResults(prev => mergeBatchResults(prev, newResult))

                processedCount += currentBatchSize
                setBatchProgress(`查询中(${Math.min(processedCount, totalCount)}/${totalCount})`)
            }

            setBatchProgress('')
        } catch (err) {
            console.error('Paste search error:', err)
            setSearchError(err instanceof Error ? err.message : '粘贴查询发生错误')
        } finally {
            setIsBatchSearching(false)
            setBatchProgress('')
        }
    }, [selectedToken])

    return {
        // Token
        tokens: allTokens,
        isLoadingTokens: isLoadingTokens || isLoadingShared,
        selectedToken,
        selectToken,

        // Tables
        tables,
        isLoadingTables,
        tablesError,
        selectedTableNames,
        toggleTable,
        selectAllTables,
        deselectAllTables,
        loadColumnsForSelected,

        // Columns
        columnsData,
        selectedColumns,
        toggleColumn,
        selectAllColumns,
        deselectAllColumns,
        duplicateTable,
        removeTableCopy,

        // Search
        searchResults,
        isSearching,
        searchError,
        performSearch,
        exportToExcel,
        exportSingleResult,
        isExporting,
        handleImageLoad,
        imageUrlCache,

        // Batch Search
        isBatchSearching,
        batchProgress,
        downloadBatchTemplate,
        performBatchSearch,
        performPasteSearch
    }
}
