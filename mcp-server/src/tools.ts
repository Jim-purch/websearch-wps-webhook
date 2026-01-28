/**
 * MCP Tools for WPS Webhook Integration
 */

import { z } from 'zod'
import type { WpsClient, WpsSearchCriteria } from './wps-client.js'

// Zod schemas for tool inputs
export const GetTableListSchema = z.object({
    tokenName: z.string().optional().describe('Token名称，用于指定使用哪个配置（如果有多个）')
})

export const SearchCriteriaSchema = z.object({
    columnName: z.string().describe('列名'),
    searchValue: z.string().describe('搜索值'),
    op: z.enum(['Contains', 'Equals']).describe('匹配方式: Contains (包含) 或 Equals (精确匹配)')
})

export const SearchSchema = z.object({
    tokenName: z.string().optional().describe('Token名称，用于指定使用哪个配置（如果有多个）'),
    sheetName: z.string().describe('表名/工作表名'),
    criteria: z.array(SearchCriteriaSchema).describe('搜索条件数组，多个条件为 AND 关系'),
    returnColumns: z.array(z.string()).optional().describe('可选，指定返回的列名数组')
})

export const BatchSearchCriteriaSchema = z.object({
    id: z.string().describe('查询标识符'),
    criteria: z.array(SearchCriteriaSchema).describe('该查询的搜索条件')
})

export const BatchSearchSchema = z.object({
    tokenName: z.string().optional().describe('Token名称，用于指定使用哪个配置（如果有多个）'),
    sheetName: z.string().describe('表名/工作表名'),
    batchCriteria: z.array(BatchSearchCriteriaSchema).describe('批量查询条件数组')
})

export const GetImageUrlsSchema = z.object({
    tokenName: z.string().optional().describe('Token名称，用于指定使用哪个配置（如果有多个）'),
    sheetName: z.string().describe('表名/工作表名'),
    cells: z.array(z.string()).describe('单元格地址数组，如 ["A1", "B2"]')
})

export const ListConfigsSchema = z.object({})

// Tool definitions
export const TOOLS = [
    {
        name: 'get_table_list',
        description: '获取 WPS 文档中的所有表/工作表信息，包括表名和列信息',
        inputSchema: GetTableListSchema
    },
    {
        name: 'search',
        description: '在指定表中进行多条件 AND 搜索，返回匹配的记录',
        inputSchema: SearchSchema
    },
    {
        name: 'batch_search',
        description: '在指定表中进行批量搜索，每个查询可以有多个条件',
        inputSchema: BatchSearchSchema
    },
    {
        name: 'get_image_urls',
        description: '获取指定单元格中图片的临时 URL',
        inputSchema: GetImageUrlsSchema
    },
    {
        name: 'list_configs',
        description: '获取所有可用的 WPS 配置名称，用于 tokenName 参数',
        inputSchema: ListConfigsSchema
    }
] as const

// Client getter type
export type ClientGetter = (tokenName?: string) => WpsClient

// Tool handlers
export async function handleGetTableList(
    getClient: ClientGetter,
    args: z.infer<typeof GetTableListSchema>
) {
    let client: WpsClient
    try {
        client = getClient(args.tokenName)
    } catch (err) {
        return {
            content: [{ type: 'text' as const, text: `错误: ${err instanceof Error ? err.message : '获取客户端失败'}` }],
            isError: true
        }
    }

    const result = await client.getTableList()

    if (!result.success) {
        return {
            content: [{ type: 'text' as const, text: `错误: ${result.error}` }],
            isError: true
        }
    }

    const tables = result.data || []
    const summary = tables.map(t => {
        const cols = t.columns.map(c => c.name).join(', ')
        return `📋 ${t.name}\n   列: ${cols || '(无列信息)'}\n   行数: ${t.rowCount ?? '未知'}`
    }).join('\n\n')

    return {
        content: [{
            type: 'text' as const,
            text: `找到 ${tables.length} 个表:\n\n${summary}`
        }]
    }
}

export async function handleSearch(
    getClient: ClientGetter,
    args: z.infer<typeof SearchSchema>
) {
    let client: WpsClient
    try {
        client = getClient(args.tokenName)
    } catch (err) {
        return {
            content: [{ type: 'text' as const, text: `错误: ${err instanceof Error ? err.message : '获取客户端失败'}` }],
            isError: true
        }
    }

    const criteria: WpsSearchCriteria[] = args.criteria.map(c => ({
        columnName: c.columnName,
        searchValue: c.searchValue,
        op: c.op
    }))

    const result = await client.searchMultiCriteria(
        args.sheetName,
        criteria,
        args.returnColumns
    )

    if (!result.success) {
        return {
            content: [{ type: 'text' as const, text: `搜索错误: ${result.error}` }],
            isError: true
        }
    }

    const data = result.data
    if (!data) {
        return {
            content: [{ type: 'text' as const, text: '未返回数据' }],
            isError: true
        }
    }

    const records = data.records || []

    if (records.length === 0) {
        return {
            content: [{
                type: 'text' as const,
                text: `在 "${args.sheetName}" 中未找到匹配记录`
            }]
        }
    }

    // Format records as readable text
    const formattedRecords = records.slice(0, 20).map((record, idx) => {
        const fields = record.fields && typeof record.fields === 'object'
            ? record.fields as Record<string, unknown>
            : record
        const fieldStr = Object.entries(fields)
            .map(([k, v]) => `  ${k}: ${formatValue(v)}`)
            .join('\n')
        return `记录 ${idx + 1}:\n${fieldStr}`
    }).join('\n\n')

    let summary = `在 "${args.sheetName}" 中找到 ${data.totalCount} 条匹配记录`
    if (data.truncated) {
        summary += ` (已截断，最大 ${data.maxRecords} 条)`
    }
    if (records.length > 20) {
        summary += `\n\n显示前 20 条:`
    }

    return {
        content: [{
            type: 'text' as const,
            text: `${summary}\n\n${formattedRecords}`
        }]
    }
}

export async function handleBatchSearch(
    getClient: ClientGetter,
    args: z.infer<typeof BatchSearchSchema>
) {
    let client: WpsClient
    try {
        client = getClient(args.tokenName)
    } catch (err) {
        return {
            content: [{ type: 'text' as const, text: `错误: ${err instanceof Error ? err.message : '获取客户端失败'}` }],
            isError: true
        }
    }

    const batchCriteria = args.batchCriteria.map(item => ({
        id: item.id,
        criteria: item.criteria.map(c => ({
            columnName: c.columnName,
            searchValue: c.searchValue,
            op: c.op
        })) as WpsSearchCriteria[]
    }))

    const result = await client.searchBatch(args.sheetName, batchCriteria)

    if (!result.success) {
        return {
            content: [{ type: 'text' as const, text: `批量搜索错误: ${result.error}` }],
            isError: true
        }
    }

    const data = result.data
    if (!data) {
        return {
            content: [{ type: 'text' as const, text: '未返回数据' }],
            isError: true
        }
    }

    const summary = `批量搜索完成:\n- 查询数: ${data.totalQueries}\n- 总匹配数: ${data.totalMatches}`

    const resultsSummary = data.results.slice(0, 10).map(r => {
        if (!r.success) {
            return `❌ ${r.id}: ${r.error}`
        }
        return `✅ ${r.id}: ${r.records?.length || 0} 条匹配`
    }).join('\n')

    let text = `${summary}\n\n${resultsSummary}`
    if (data.results.length > 10) {
        text += `\n... 还有 ${data.results.length - 10} 个查询结果`
    }

    return {
        content: [{ type: 'text' as const, text }]
    }
}

export async function handleGetImageUrls(
    getClient: ClientGetter,
    args: z.infer<typeof GetImageUrlsSchema>
) {
    let client: WpsClient
    try {
        client = getClient(args.tokenName)
    } catch (err) {
        return {
            content: [{ type: 'text' as const, text: `错误: ${err instanceof Error ? err.message : '获取客户端失败'}` }],
            isError: true
        }
    }

    const result = await client.getImageUrls(args.sheetName, args.cells)

    if (!result.success) {
        return {
            content: [{ type: 'text' as const, text: `获取图片错误: ${result.error}` }],
            isError: true
        }
    }

    const data = result.data
    if (!data?.imageUrls) {
        return {
            content: [{ type: 'text' as const, text: '未返回图片数据' }],
            isError: true
        }
    }

    const urls = Object.entries(data.imageUrls)
        .map(([cell, url]) => `${cell}: ${url || '(无图片)'}`)
        .join('\n')

    return {
        content: [{
            type: 'text' as const,
            text: `获取到 ${data.successCount || 0}/${data.requestedCount || 0} 个图片URL:\n\n${urls}`
        }]
    }
}

export async function handleListConfigs(configs: Array<{ name: string; description?: string }>) {
    const configList = configs.map(cfg => {
        if (cfg.description) {
            return `- **${cfg.name}**: ${cfg.description}`
        }
        return `- ${cfg.name}`
    }).join('\n')

    return {
        content: [{
            type: 'text' as const,
            text: `可用配置 (${configs.length}):\n\n${configList}`
        }]
    }
}

// Helper function
function formatValue(value: unknown): string {
    if (value === null || value === undefined) return '(空)'
    if (typeof value === 'object') {
        // Handle image objects
        const obj = value as Record<string, unknown>
        if (obj._type === 'image' || obj._type === 'dispimg') {
            return '[图片]'
        }
        return JSON.stringify(value)
    }
    return String(value)
}

