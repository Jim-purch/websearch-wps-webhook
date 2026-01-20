/**
 * WPS 响应解析器
 * 1. 从 data.result 或 data.logs 中提取 JSON
 * 2. 处理分块 JSON 格式 (__CHUNK_N__:content)
 */

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
                // 解析分块格式 __CHUNK_N__:content
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

    // 按顺序拼接分块
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
export function parseWpsResponse<T = unknown>(response: WpsApiResponse): ParsedWpsResult<T> {
    try {
        const data = response?.data
        if (!data) {
            return { success: false, error: 'No data in response' }
        }

        const resultStr = data.result
        const logs = data.logs || []

        let parsed: object | null = null

        // 尝试从 result 解析
        if (typeof resultStr === 'string' &&
            resultStr !== '[Undefined]' &&
            resultStr !== 'null' &&
            resultStr !== '') {
            try {
                parsed = JSON.parse(resultStr)
            } catch {
                // 继续尝试从 logs 解析
            }
        } else if (typeof resultStr === 'object' && resultStr !== null) {
            parsed = resultStr
        }

        // 如果 result 解析失败，尝试从 logs 解析分块 JSON
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
