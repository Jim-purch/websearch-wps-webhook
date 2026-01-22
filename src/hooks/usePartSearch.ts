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
    criteriaDescription: string
    records: Record<string, unknown>[]
    totalCount: number
    truncated: boolean
    originalTotalCount?: number | string
    maxRecords?: number
    error?: string
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
            conditionsByTableKey[cond.tableName].criteria.push({
                columnName: cond.columnName,
                searchValue: cond.searchValue,
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
                    results.push({
                        tableName: displayTableName,
                        criteriaDescription: criteriaDesc,
                        records: data.records || [],
                        totalCount: data.totalCount || 0,
                        truncated: data.truncated || false,
                        originalTotalCount: data.originalTotalCount,
                        maxRecords: data.maxRecords
                    })
                } else {
                    results.push({
                        tableName: displayTableName,
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

    // 导出到 Excel
    const exportToExcel = useCallback(async (conditions: SearchCondition[]) => {
        setIsExporting(true)
        setSearchError(null)

        try {
            let results: TableSearchResult[]

            if (conditions.length > 0) {
                // 如果有搜索条件，尝试重新获取（确保数据最新/完整）
                results = await fetchSearchResults(conditions)
            } else if (searchResults.length > 0) {
                // 如果没有搜索条件但有现有结果（如批量搜索结果），直接导出
                results = searchResults
            } else {
                throw new Error('请至少填写一个搜索条件或先执行搜索')
            }

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
                        const allKeys = Array.from(new Set(flatRecords.flatMap(r => Object.keys(r))))

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
                                        // 检查缓存中是否有此图片的URL
                                        const cacheKey = `${result.tableName}__${imgInfo.cellAddress}`
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
                                const cacheKey = `${result.tableName}__${address}`
                                fetchedImageUrls[address] = imageUrlCache[cacheKey]
                            }
                        }

                        // 2. 如果有未缓存的DISPIMG单元格，获取图片URL
                        if (dispImgCellAddressesToFetch.length > 0 && selectedToken) {
                            console.log(`导出: 获取 ${dispImgCellAddressesToFetch.length} 个未缓存的DISPIMG图片URL...`)
                            try {
                                const imgResult = await getImageUrls(selectedToken.id, result.tableName, dispImgCellAddressesToFetch)
                                if (imgResult.success && imgResult.data?.imageUrls) {
                                    Object.assign(fetchedImageUrls, imgResult.data.imageUrls)
                                    console.log(`导出: 成功获取 ${Object.values(imgResult.data.imageUrls).filter(Boolean).length} 个新图片URL`)
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
                                const value = record[key]
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
    }, [fetchSearchResults, searchResults])

    // 下载批量查询模板
    const downloadBatchTemplate = useCallback(async () => {
        if (!Object.values(selectedColumns).some(cols => cols.length > 0)) {
            setSearchError('请先选择至少一个表和列')
            return
        }

        try {
            const ExcelJS = (await import('exceljs')).default
            const { saveAs } = (await import('file-saver'))
            const workbook = new ExcelJS.Workbook()
            const worksheet = workbook.addWorksheet('Batch Query Template')

            // 生成表头: 表名__列名
            // 另外添加一个 ID 列方便追踪（可选，但这里我们主要靠行号或ID列）
            const headers = ['Query_ID'] // 第一列作为ID

            for (const [tableKey, columns] of Object.entries(selectedColumns)) {
                if (columns.length === 0) continue
                for (const col of columns) {
                    headers.push(`${tableKey}__${col}`)
                }
            }

            worksheet.addRow(headers)

            // 添加一行示例数据
            const exampleRow = ['example_1']
            for (let i = 1; i < headers.length; i++) {
                exampleRow.push('')
            }
            worksheet.addRow(exampleRow)

            // 设置列宽
            worksheet.columns = headers.map(h => ({ header: h, key: h, width: 25 }))

            const buffer = await workbook.xlsx.writeBuffer()
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
            saveAs(blob, `批量查询模板_${new Date().toISOString().slice(0, 10)}.xlsx`)

        } catch (err) {
            console.error('Template download error:', err)
            setSearchError('下载模板失败')
        }
    }, [selectedColumns])

    // 执行批量搜索 (解析 Excel -> 调用 API -> 聚合结果)
    const performBatchSearch = useCallback(async (file: File) => {
        if (!selectedToken?.id || !selectedToken?.webhook_url) {
            setSearchError('Token 配置不完整')
            return
        }

        setIsBatchSearching(true)
        setSearchError(null)
        setSearchResults([]) // 清空旧结果

        try {
            const ExcelJS = (await import('exceljs')).default
            const workbook = new ExcelJS.Workbook()
            await workbook.xlsx.load(await file.arrayBuffer())

            const worksheet = workbook.getWorksheet(1)
            if (!worksheet) throw new Error('Excel 文件为空')

            // 1. 解析表头映射
            // 格式: tableName__columnName
            const headerMap: Record<number, { tableKey: string, columnName: string } | 'ID'> = {}

            const headerRow = worksheet.getRow(1)
            let hasValidColumn = false

            headerRow.eachCell((cell, colNumber) => {
                const val = (cell.value?.toString() || '').trim()
                if (val.toLowerCase() === 'query_id' || val.toLowerCase() === 'id') {
                    headerMap[colNumber] = 'ID'
                } else if (val.includes('__')) {
                    const [tableKey, columnName] = val.split('__')
                    if (tableKey && columnName) {
                        headerMap[colNumber] = { tableKey, columnName }
                        hasValidColumn = true
                    }
                }
            })

            if (!hasValidColumn) {
                throw new Error('未找到有效的查询列 (格式: 表名__列名)')
            }

            // 2. 读取数据行并构建查询
            // Group by Table -> List of { id, criteria[] }
            const batchRequests: Record<string, { realTableName: string, items: Array<{ id: string, criteria: WpsSearchCriteria[] }> }> = {}

            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return // 跳过表头

                const rowId = row.getCell(1).value?.toString() || `row_${rowNumber}`
                const rowCriteriaByTable: Record<string, WpsSearchCriteria[]> = {}
                let hasCriteria = false

                // 遍历该行的所有列
                row.eachCell((cell, colNumber) => {
                    const colInfo = headerMap[colNumber]
                    if (!colInfo || colInfo === 'ID') return

                    const cellValue = cell.value?.toString() || ''
                    if (cellValue.trim() === '') return // 跳过空值

                    const { tableKey, columnName } = colInfo

                    // 初始化该表的 criteria 数组
                    if (!rowCriteriaByTable[tableKey]) {
                        rowCriteriaByTable[tableKey] = []
                    }

                    // 默认使用 Contains, 可以扩展逻辑支持 Exact (例如通过 Excel 注释或特定前缀)
                    // 这里简化逻辑，默认 Contains
                    rowCriteriaByTable[tableKey].push({
                        columnName: columnName,
                        searchValue: cellValue,
                        op: 'Contains'
                    })
                    hasCriteria = true
                })

                if (!hasCriteria) return

                // 将该行的查询分配到各个表的 batch requests 中
                for (const [tableKey, criteria] of Object.entries(rowCriteriaByTable)) {
                    const realTableName = tableKey.includes('__copy_') ? tableKey.split('__copy_')[0] : tableKey

                    if (!batchRequests[tableKey]) {
                        batchRequests[tableKey] = { realTableName, items: [] }
                    }

                    batchRequests[tableKey].items.push({
                        id: rowId, // 使用行号或ID作为标识
                        criteria: criteria
                    })
                }
            })

            // 3. 并行执行批量查询
            const tableKeys = Object.keys(batchRequests)
            if (tableKeys.length === 0) {
                throw new Error('未解析到有效的查询数据')
            }

            const allResults: TableSearchResult[] = []

            await Promise.all(tableKeys.map(async (tableKey) => {
                const { realTableName, items } = batchRequests[tableKey]
                const displayTableName = tableKey.includes('__copy_')
                    ? `${realTableName} (副本${tableKey.split('__copy_')[1]})`
                    : realTableName

                try {
                    const res = await searchBatch(selectedToken.id, realTableName, items)

                    if (res.success && res.data) {
                        const batchRes = res.data as WpsBatchSearchResult

                        // 将批量结果扁平化为 TableSearchResult 列表
                        // 每个成功的 query item 可能会返回多条 records
                        // 我们把它们合并显示，或者保留 ID 映射
                        // 为了复用 ResultTable，我们将所有结果合并，并添加 QueryID 字段

                        const allRecords: Record<string, unknown>[] = []

                        // 遍历每个查询项的结果
                        for (const itemResult of batchRes.results) {
                            if (itemResult.success && itemResult.records) {
                                // 给每条记录附加 Query ID，方便用户分辨
                                const recordsWithId = itemResult.records.map(r => ({
                                    ...r,
                                    _BatchQueryID: itemResult.id // 特殊字段显示来源
                                }))
                                allRecords.push(...recordsWithId)
                            }
                        }

                        allResults.push({
                            tableName: displayTableName,
                            criteriaDescription: `批量查询 (${batchRes.totalQueries} 个条件)`,
                            records: allRecords,
                            totalCount: batchRes.totalMatches,
                            truncated: false, // 批量查询每个子查询可能截断，但不影响整体显示逻辑
                            error: undefined
                        })

                    } else {
                        allResults.push({
                            tableName: displayTableName,
                            criteriaDescription: '批量查询失败',
                            records: [],
                            totalCount: 0,
                            truncated: false,
                            error: res.error || 'API 调用失败'
                        })
                    }
                } catch (err) {
                    allResults.push({
                        tableName: displayTableName,
                        criteriaDescription: '批量查询异常',
                        records: [],
                        totalCount: 0,
                        truncated: false,
                        error: err instanceof Error ? err.message : '未知错误'
                    })
                }
            }))

            setSearchResults(allResults)

        } catch (err) {
            console.error('Batch search error:', err)
            setSearchError(err instanceof Error ? err.message : '批量搜索发生错误')
        } finally {
            setIsBatchSearching(false)
        }
    }, [selectedToken, selectedColumns])

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
        isExporting,
        handleImageLoad,
        imageUrlCache,

        // Batch Search
        isBatchSearching,
        downloadBatchTemplate,
        performBatchSearch
    }
}
