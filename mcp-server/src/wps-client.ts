/**
 * WPS Webhook 客户端 (直接调用版本，用于 MCP Server)
 */

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
    tables?: WpsTable[]
    sheets?: WpsTable[]
}

export interface WpsSearchCriteria {
    columnName: string
    searchValue: string
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

export interface WpsImageUrlResult {
    success: boolean
    sheetName?: string
    requestedCount?: number
    successCount?: number
    imageUrls?: Record<string, string | null>
}

export interface WpsApiResponse {
    data?: {
        result?: string | object
        logs?: Array<{ args?: unknown[] }>
    }
}

export interface ParsedWpsResult<T = unknown> {
    success: boolean
    error?: string
    message?: string
    data?: T
}

/**
 * 从 WPS logs 中解析分块 JSON
 */
function parseChunkedJsonFromLogs(logs: Array<{ args?: unknown[] }>): object | null {
    const chunks: Record<number, string> = {}
    let inJson = false

    for (const log of logs) {
        const args = log.args || []
        for (const arg of args) {
            if (typeof arg !== 'string') continue

            if (arg.includes('__RESULT_JSON_START__')) {
                inJson = true
                continue
            }
            if (arg.includes('__RESULT_JSON_END__')) {
                inJson = false
                continue
            }
            if (inJson) {
                const match = arg.match(/__CHUNK_(\d+)__:(.+)/)
                if (match) {
                    const chunkIdx = parseInt(match[1], 10)
                    const chunkContent = match[2]
                    chunks[chunkIdx] = chunkContent
                }
            }
        }
    }

    if (Object.keys(chunks).length === 0) {
        return null
    }

    const sortedKeys = Object.keys(chunks).map(Number).sort((a, b) => a - b)
    const jsonContent = sortedKeys.map(k => chunks[k]).join('')

    try {
        return JSON.parse(jsonContent)
    } catch {
        console.error('Failed to parse chunked JSON:', jsonContent.slice(0, 100))
        return null
    }
}

/**
 * 解析 WPS Webhook 响应
 */
function parseWpsResponse<T = unknown>(response: WpsApiResponse): ParsedWpsResult<T> {
    try {
        const data = response?.data
        if (!data) {
            return { success: false, error: 'No data in response' }
        }

        const resultStr = data.result
        const logs = data.logs || []

        let parsed: object | null = null

        if (typeof resultStr === 'string' &&
            resultStr !== '[Undefined]' &&
            resultStr !== 'null' &&
            resultStr !== '') {
            try {
                parsed = JSON.parse(resultStr)
            } catch {
                // Continue to parse from logs
            }
        } else if (typeof resultStr === 'object' && resultStr !== null) {
            parsed = resultStr
        }

        if (!parsed && logs.length > 0) {
            parsed = parseChunkedJsonFromLogs(logs)
        }

        if (!parsed) {
            return { success: false, error: 'Failed to parse response' }
        }

        const typedParsed = parsed as Record<string, unknown>

        if (typedParsed.success === false) {
            return {
                success: false,
                error: (typedParsed.error as string) || 'Unknown error',
                message: typedParsed.message as string | undefined
            }
        }

        return {
            success: true,
            data: parsed as T
        }
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Parse error'
        }
    }
}

/**
 * WPS 客户端类
 */
export class WpsClient {
    private webhookUrl: string
    private token: string

    constructor(webhookUrl: string, token: string) {
        this.webhookUrl = webhookUrl
        this.token = token
    }

    /**
     * 调用 WPS Webhook
     */
    private async callWps<T = unknown>(argv: Record<string, unknown>): Promise<ParsedWpsResult<T>> {
        try {
            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'AirScript-Token': this.token
                },
                body: JSON.stringify({
                    Context: { argv }
                })
            })

            if (!response.ok) {
                return {
                    success: false,
                    error: `HTTP ${response.status}: ${response.statusText}`
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
    async getTableList(): Promise<ParsedWpsResult<WpsTable[]>> {
        const result = await this.callWps<WpsGetAllResult>({
            action: 'getAll'
        })

        if (!result.success || !result.data) {
            return {
                success: false,
                error: result.error || '获取表列表失败'
            }
        }

        const tables = result.data.tables || result.data.sheets || []
        return {
            success: true,
            data: tables
        }
    }

    /**
     * 多条件 AND 搜索
     */
    async searchMultiCriteria(
        sheetName: string,
        criteria: WpsSearchCriteria[],
        returnColumns?: string[]
    ): Promise<ParsedWpsResult<WpsSearchResult>> {
        return this.callWps<WpsSearchResult>({
            action: 'searchMulti',
            sheetName,
            criteria,
            returnColumns
        })
    }

    /**
     * 批量搜索
     */
    async searchBatch(
        sheetName: string,
        batchCriteria: Array<{ id: string; criteria: WpsSearchCriteria[] }>
    ): Promise<ParsedWpsResult<WpsBatchSearchResult>> {
        return this.callWps<WpsBatchSearchResult>({
            action: 'searchBatch',
            sheetName,
            batchCriteria
        })
    }

    /**
     * 获取指定单元格的图片URL
     */
    async getImageUrls(
        sheetName: string,
        cells: string[]
    ): Promise<ParsedWpsResult<WpsImageUrlResult>> {
        return this.callWps<WpsImageUrlResult>({
            action: 'getImageUrl',
            sheetName,
            cells
        })
    }
}
