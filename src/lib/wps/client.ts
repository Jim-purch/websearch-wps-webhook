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
    returnColumns?: string[] // 新增参数：指定返回列
): Promise<ParsedWpsResult<WpsSearchResult>> {
    const result = await callWpsProxy<WpsSearchResult>(tokenId, {
        action: 'searchMulti',
        sheetName,
        criteria,
        returnColumns // 传递给后端
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
 */
export async function searchBatch(
    tokenId: string,
    sheetName: string,
    batchCriteria: Array<{ id: string; criteria: WpsSearchCriteria[] }>
): Promise<ParsedWpsResult<WpsBatchSearchResult>> {
    const result = await callWpsProxy<WpsBatchSearchResult>(tokenId, {
        action: 'searchBatch',
        sheetName,
        batchCriteria
    })

    return result
}
