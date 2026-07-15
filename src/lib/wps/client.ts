/**
 * WPS Webhook 客户端
 * 通过 Next.js API 代理调用 WPS AirScript Webhook（解决 CORS 问题）
 */

import { parseWpsResponse, type ParsedWpsResult } from './parser'

// 类型定义
export interface WpsColumn {
    name: string
    type?: string
    columnIndex?: number
    columnLetter?: string
    id?: string
}

export interface WpsTable {
    name: string
    id?: string
    columns: WpsColumn[]
    rowCount?: number
    columnCount?: number
    usedRange?: string
    tokenId?: string
    tokenName?: string
    cacheTime?: string | null
    isGoogleSheets?: boolean
    webhookQueueKey?: string
}

export interface WpsGetAllResult {
    success: boolean
    tables?: WpsTable[]  // 多维表格返回
    sheets?: WpsTable[]  // 智能表格返回
}

export interface WpsSearchCriteria {
    columnName: string
    searchValue: string
    searchValueClean?: string  // 清理后的搜索值（用于匹配验证）
    op: 'Contains' | 'Equals'
    clean?: boolean
}

export interface WpsSearchResult {
    success: boolean
    sheetName: string
    criteriaCount?: number
    criteriaDescription?: string
    totalCount: number
    truncated?: boolean
    originalTotalCount?: number | string
    maxRecords?: number
    records: Record<string, unknown>[]
}

/**
 * 通过代理 API 调用 WPS Webhook
 */
async function callWpsProxy<T = unknown>(
    tokenId: string,
    argv: Record<string, unknown>
): Promise<ParsedWpsResult<T>> {
    try {
        const response = await fetch('/api/wps/proxy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ tokenId, argv })
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            return {
                success: false,
                error: errorData.error || `HTTP ${response.status}: ${response.statusText}`
            }
        }

        const data = await response.json()
        return parseWpsResponse<T>(data)
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : '请求失败'
        }
    }
}

/**
 * 获取所有表信息
 */
export async function getTableList(
    tokenId: string
): Promise<ParsedWpsResult<WpsTable[]>> {
    const result = await callWpsProxy<WpsGetAllResult>(tokenId, {
        action: 'getAll'
    })

    if (!result.success || !result.data) {
        return {
            success: false,
            error: result.error || '获取表列表失败'
        }
    }

    // 兼容 tables 和 sheets 两种返回格式
    const tables = result.data.tables || result.data.sheets || []

    return {
        success: true,
        data: tables
    }
}

/**
 * 多条件 AND 搜索
 */
export async function searchMultiCriteria(
    tokenId: string,
    sheetName: string,
    criteria: WpsSearchCriteria[],
    returnColumns?: string[], // 新增参数：指定返回列
    limit?: number,
    offset?: number,
    bypassCache?: boolean
): Promise<ParsedWpsResult<WpsSearchResult>> {
    const result = await callWpsProxy<WpsSearchResult>(tokenId, {
        action: 'searchMulti',
        sheetName,
        criteria,
        returnColumns, // 传递给后端
        limit,
        offset,
        bypassCache
    })

    return result
}

/**
 * 获取表详情（用于获取列信息）
 */
export async function getTableDetails(
    tokenId: string,
    sheetName: string
): Promise<ParsedWpsResult<{ columns?: string[] }>> {
    const result = await callWpsProxy<{
        success: boolean
        columns?: string[]
        table?: { columns?: WpsColumn[] }
    }>(tokenId, {
        action: 'getData',
        sheetName,
        range: '1:1',
        hasHeader: true
    })

    if (!result.success || !result.data) {
        return {
            success: false,
            error: result.error || '获取表详情失败'
        }
    }

    // 提取列名
    let columns: string[] = []
    const data = result.data

    if (Array.isArray(data.columns)) {
        columns = data.columns.map(c =>
            typeof c === 'string' ? c : (c as WpsColumn).name
        )
    } else if (data.table?.columns) {
        columns = data.table.columns.map(c => c.name)
    }

    return {
        success: true,
        data: { columns }
    }
}

// 图片URL获取结果类型
export interface WpsImageUrlResult {
    success: boolean
    sheetName?: string
    requestedCount?: number
    successCount?: number
    imageUrls?: Record<string, string | null>
}

/**
 * 获取指定单元格的图片URL
 * @param tokenId - WPS Token ID
 * @param sheetName - 工作表名称
 * @param cells - 单元格地址数组 (如 ["A1", "B2"])
 */
export async function getImageUrls(
    tokenId: string,
    sheetName: string,
    cells: string[]
): Promise<ParsedWpsResult<WpsImageUrlResult>> {
    const result = await callWpsProxy<WpsImageUrlResult>(tokenId, {
        action: 'getImageUrl',
        sheetName,
        cells
    })

    return result
}

/**
 * 批量搜索结果类型
 */
export interface WpsBatchSearchResult {
    success: boolean
    sheetName: string
    totalQueries: number
    totalMatches: number
    results: Array<{
        id: string
        success: boolean
        records?: Record<string, unknown>[]
        error?: string
    }>
}

/**
 * 批量搜索
 * @param tokenId
 * @param sheetName
 * @param batchCriteria Array of { id: string, criteria: WpsSearchCriteria[] }
 * @param returnColumns (可选) 指定返回的列名数组
 */
export async function searchBatch(
    tokenId: string,
    sheetName: string,
    batchCriteria: Array<{ id: string; criteria: WpsSearchCriteria[] }>,
    returnColumns?: string[], // 新增参数
    limit?: number,
    bypassCache?: boolean,
    isSameValueSearch?: boolean,
    sameValueCols?: string[],
    sameValueValues?: string[]
): Promise<ParsedWpsResult<WpsBatchSearchResult>> {
    const result = await callWpsProxy<WpsBatchSearchResult>(tokenId, {
        action: 'searchBatch',
        sheetName,
        batchCriteria,
        returnColumns, // 传递给后端
        limit,
        bypassCache,
        isSameValueSearch,
        sameValueCols,
        sameValueValues
    })

    return result
}

/** 分批回退时每批的最大查询条数（优先从环境变量读取） */
const FALLBACK_CHUNK_SIZE = (() => {
    const env = process.env.NEXT_PUBLIC_WPS_FALLBACK_CHUNK_SIZE
    const parsed = env ? parseInt(env, 10) : NaN
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 10
})()

/**
 * 带分批回退的批量搜索
 *
 * 当首次请求遇到 403/500 错误时，自动将查询拆分为每批 N 条重试。
 * - 单个批次失败时仅重试该批次（最多 2 次），不影响其他批次
 * - 每批成功后立即通过 onChunkResult 回调返回结果，实现增量显示
 * - 通过 onProgress 回调报告整体进度
 *
 * @param onProgress 回调 (completed, total) → 用于 UI 展示进度
 * @param onChunkResult 回调 (chunkResult, completedBatches, totalBatches) → 每批成功后增量返回结果
 */
export async function searchBatchWithFallback(
    tokenId: string,
    sheetName: string,
    batchCriteria: Array<{ id: string; criteria: WpsSearchCriteria[] }>,
    returnColumns?: string[],
    limit?: number,
    bypassCache?: boolean,
    isSameValueSearch?: boolean,
    sameValueCols?: string[],
    sameValueValues?: string[],
    onProgress?: (completed: number, total: number) => void,
    onChunkResult?: (chunkResult: WpsBatchSearchResult, completedBatches: number, totalBatches: number) => void,
    fallbackChunkSize?: number
): Promise<ParsedWpsResult<WpsBatchSearchResult>> {
    // 首次完整请求
    const result = await searchBatch(
        tokenId, sheetName, batchCriteria,
        returnColumns, limit, bypassCache,
        isSameValueSearch, sameValueCols, sameValueValues
    )

    if (result.success) {
        return result
    }

    // 判断是否为可重试的 403/500 错误，且查询数 > 1 才有意义分批
    const isRetryable = result.error && (result.error.includes('403') || result.error.includes('500'))
    if (!isRetryable || batchCriteria.length <= 1) {
        return result
    }

    // 启用分批回退，使用用户指定的分批大小或默认值
    const effectiveChunkSize = fallbackChunkSize && fallbackChunkSize > 0 ? fallbackChunkSize : FALLBACK_CHUNK_SIZE
    const chunks: Array<{ id: string; criteria: WpsSearchCriteria[] }[]> = []
    for (let i = 0; i < batchCriteria.length; i += effectiveChunkSize) {
        chunks.push(batchCriteria.slice(i, i + effectiveChunkSize))
    }

    const allResults: WpsBatchSearchResult['results'] = []
    let totalMatches = 0
    let succeededChunks = 0
    let lastError = result.error
    let completedItems = 0

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]

        // 批次间延迟，降低触发限流的概率
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 500))
        }

        let chunkSucceeded = false

        // 单批次最多重试 2 次
        for (let attempt = 0; attempt < 2 && !chunkSucceeded; attempt++) {
            if (attempt > 0) {
                await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000))
            }

            try {
                const chunkResult = await searchBatch(
                    tokenId, sheetName, chunk,
                    returnColumns, limit, bypassCache,
                    isSameValueSearch, sameValueCols, sameValueValues
                )

                if (chunkResult.success && chunkResult.data) {
                    allResults.push(...(chunkResult.data.results || []))
                    totalMatches += chunkResult.data.totalMatches || 0
                    succeededChunks++
                    chunkSucceeded = true

                    // 增量回调：立即通知调用方此批次的结果
                    onChunkResult?.(chunkResult.data, i + 1, chunks.length)
                } else {
                    lastError = chunkResult.error
                }
            } catch (err) {
                lastError = err instanceof Error ? err.message : '未知错误'
            }
        }

        completedItems += chunk.length
        onProgress?.(completedItems, batchCriteria.length)
    }

    if (succeededChunks > 0) {
        const mergedResult: WpsBatchSearchResult = {
            success: true,
            sheetName,
            totalQueries: batchCriteria.length,
            totalMatches,
            results: allResults
        }
        return { success: true, data: mergedResult }
    }

    return { success: false, error: `分批重试全部失败 (${lastError})` }
}

/**
 * 刷新 Google Sheets 缓存
 */
export async function refreshGsheetCache(
    tokenId: string,
    sheetName: string
): Promise<ParsedWpsResult<{ sheetName: string; cacheTime: string | null }>> {
    const result = await callWpsProxy<{ sheetName: string; cacheTime: string | null }>(tokenId, {
        action: 'refreshCache',
        sheetName
    })
    return result
}

export interface WpsWriteResult {
    success: boolean
    sheetName: string
    cellAddress?: string
    rangeAddress?: string
    rowIndex?: number
    cellCount?: number
    writtenCells?: number
    value?: any
    message?: string
}

/**
 * 设置单个单元格的值
 */
export async function setCellValue(
    tokenId: string,
    sheetName: string,
    cellAddress: string,
    value: any
): Promise<ParsedWpsResult<WpsWriteResult>> {
    return await callWpsProxy<WpsWriteResult>(tokenId, {
        action: 'setCellValue',
        sheetName,
        cellAddress,
        value
    })
}

/**
 * 批量设置区域的值
 */
export async function setRangeValues(
    tokenId: string,
    sheetName: string,
    rangeAddress: string,
    values: any[][]
): Promise<ParsedWpsResult<WpsWriteResult>> {
    return await callWpsProxy<WpsWriteResult>(tokenId, {
        action: 'setRangeValues',
        sheetName,
        rangeAddress,
        values
    })
}

/**
 * 根据列名设置指定行的数据
 */
export async function updateRow(
    tokenId: string,
    sheetName: string,
    rowIndex: number,
    rowData: Record<string, any>,
    oldRowData?: Record<string, any>
): Promise<ParsedWpsResult<WpsWriteResult>> {
    return await callWpsProxy<WpsWriteResult>(tokenId, {
        action: 'updateRow',
        sheetName,
        rowIndex,
        rowData,
        oldRowData
    })
}

/**
 * 批量删除指定行
 */
export async function deleteRows(
    tokenId: string,
    sheetName: string,
    rowNumbers: number[],
    oldRowsData?: Record<string, any>[]
): Promise<ParsedWpsResult<{ sheetName: string; deletedCount: number; message: string }>> {
    return await callWpsProxy<{ sheetName: string; deletedCount: number; message: string }>(tokenId, {
        action: 'deleteRows',
        sheetName,
        rowNumbers,
        oldRowsData
    })
}
