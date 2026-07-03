/**
 * Google Sheets API 服务端客户端
 * 
 * 提供与 WPS AirScript 等价的数据查询功能：
 * 1. 获取工作簿中全部工作表列表（含列信息）
 * 2. 在指定工作表中搜索包含特定值的单元格
 * 3. 多条件 AND 搜索
 * 4. 获取指定区域的数据
 * 5. 批量搜索
 * 
 * 认证方式：
 * - API Key: 适用于公开共享的 Google Sheets
 * - Service Account JSON: 适用于私有 Google Sheets
 * 
 * 返回格式与 WPS AirScript 一致，便于上层统一处理。
 */

// ========== 类型定义 ==========

interface GoogleSheetsAuth {
    type: 'apikey' | 'serviceaccount'
    apiKey?: string
    accessToken?: string
}

interface SheetProperties {
    sheetId: number
    title: string
    gridProperties?: {
        rowCount: number
        columnCount: number
    }
}

interface SpreadsheetMetadata {
    spreadsheetId: string
    properties: { title: string }
    sheets: Array<{ properties: SheetProperties }>
}

interface SearchCriteria {
    columnName: string
    searchValue: string
    op?: 'Contains' | 'Equals'
}

interface BatchCriteriaItem {
    id: string
    criteria: SearchCriteria[]
}

// ========== 认证辅助 ==========

/**
 * 解析 token_value 判断认证类型
 * - 如果是 JSON 格式（Service Account），解析并获取 access token
 * - 否则视为 API Key
 */
async function resolveAuth(tokenValue: string): Promise<GoogleSheetsAuth> {
    const trimmed = tokenValue.trim()

    // 尝试解析为 Service Account JSON
    if (trimmed.startsWith('{')) {
        try {
            const credentials = JSON.parse(trimmed)
            if (credentials.type === 'service_account' && credentials.private_key && credentials.client_email) {
                const accessToken = await getServiceAccountAccessToken(credentials)
                return { type: 'serviceaccount', accessToken }
            }
        } catch {
            // 不是有效 JSON，降级为 API Key
        }
    }

    return { type: 'apikey', apiKey: trimmed }
}

/**
 * 使用 Service Account 凭据获取 OAuth2 Access Token
 * 通过 JWT 签名 + Token 交换实现
 */
async function getServiceAccountAccessToken(credentials: {
    client_email: string
    private_key: string
    token_uri?: string
}): Promise<string> {
    const crypto = await import('crypto')

    const tokenUri = credentials.token_uri || 'https://oauth2.googleapis.com/token'
    const scope = 'https://www.googleapis.com/auth/spreadsheets.readonly'

    const now = Math.floor(Date.now() / 1000)
    const header = { alg: 'RS256', typ: 'JWT' }
    const payload = {
        iss: credentials.client_email,
        scope,
        aud: tokenUri,
        iat: now,
        exp: now + 3600
    }

    const segments = [
        base64UrlEncode(JSON.stringify(header)),
        base64UrlEncode(JSON.stringify(payload))
    ]

    const signingInput = segments.join('.')
    const signer = crypto.createSign('RSA-SHA256')
    signer.update(signingInput)
    const signature = signer.sign(credentials.private_key, 'base64url')

    const jwt = `${signingInput}.${signature}`

    // 交换 access token
    const response = await fetch(tokenUri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt
        })
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Service Account token exchange failed: ${response.status} ${errorText}`)
    }

    const tokenData = await response.json()
    return tokenData.access_token
}

function base64UrlEncode(str: string): string {
    return Buffer.from(str)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
}

// ========== Google Sheets API 调用 ==========

/**
 * 调用 Google Sheets API
 */
async function callSheetsApi<T>(
    path: string,
    auth: GoogleSheetsAuth,
    queryParams?: Record<string, string>
): Promise<T> {
    const baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets'
    const url = new URL(`${baseUrl}${path}`)

    if (queryParams) {
        for (const [key, value] of Object.entries(queryParams)) {
            url.searchParams.set(key, value)
        }
    }

    const headers: Record<string, string> = {}

    if (auth.type === 'apikey') {
        url.searchParams.set('key', auth.apiKey!)
    } else {
        headers['Authorization'] = `Bearer ${auth.accessToken}`
    }

    const response = await fetch(url.toString(), { headers })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Google Sheets API error: ${response.status} - ${errorText}`)
    }

    return response.json() as Promise<T>
}

/**
 * 获取 Spreadsheet 元数据（工作表列表等）
 */
async function getSpreadsheetMetadata(
    spreadsheetId: string,
    auth: GoogleSheetsAuth
): Promise<SpreadsheetMetadata> {
    return callSheetsApi<SpreadsheetMetadata>(
        `/${spreadsheetId}`,
        auth,
        { fields: 'spreadsheetId,properties.title,sheets.properties' }
    )
}

/**
 * 获取指定范围的值
 */
async function getSheetValues(
    spreadsheetId: string,
    range: string,
    auth: GoogleSheetsAuth
): Promise<string[][]> {
    const data = await callSheetsApi<{ values?: string[][] }>(
        `/${spreadsheetId}/values/${encodeURIComponent(range)}`,
        auth,
        { valueRenderOption: 'FORMATTED_VALUE' }
    )
    return data.values || []
}

/**
 * 列号转字母（1-based）
 */
function columnToLetter(colNum: number): string {
    let letter = ''
    let temp: number
    while (colNum > 0) {
        temp = (colNum - 1) % 26
        letter = String.fromCharCode(temp + 65) + letter
        colNum = Math.floor((colNum - temp - 1) / 26)
    }
    return letter
}

// ========== 核心功能 ==========

/**
 * 获取全部工作表信息（等价于 AirScript 的 getAllSheetsInfo）
 */
export async function getAllSheetsInfo(tokenValue: string, spreadsheetId: string) {
    try {
        const auth = await resolveAuth(tokenValue)
        const metadata = await getSpreadsheetMetadata(spreadsheetId, auth)

        const sheets = []

        for (const sheet of metadata.sheets) {
            const sheetName = sheet.properties.title
            const gridProps = sheet.properties.gridProperties

            // 获取第一行作为表头
            let columns: Array<{
                name: string
                type: string
                columnIndex: number
                columnLetter: string
            }> = []

            try {
                const headerValues = await getSheetValues(
                    spreadsheetId,
                    `'${sheetName}'!1:1`,
                    auth
                )

                if (headerValues.length > 0 && headerValues[0].length > 0) {
                    const nameCounts: Record<string, number> = {}

                    columns = headerValues[0].map((header, idx) => {
                        let colName = header || columnToLetter(idx + 1)

                        // 处理重复列名
                        if (nameCounts[colName]) {
                            nameCounts[colName]++
                            colName = `${colName}-${nameCounts[colName]}`
                        } else {
                            nameCounts[colName] = 1
                        }

                        return {
                            name: colName,
                            type: 'string',
                            columnIndex: idx + 1,
                            columnLetter: columnToLetter(idx + 1)
                        }
                    })
                }
            } catch (err) {
                console.error(`Failed to get headers for sheet ${sheetName}:`, err)
            }

            sheets.push({
                name: sheetName,
                index: metadata.sheets.indexOf(sheet) + 1,
                usedRange: gridProps
                    ? `A1:${columnToLetter(gridProps.columnCount)}${gridProps.rowCount}`
                    : '',
                rowCount: gridProps?.rowCount || 0,
                columnCount: gridProps?.columnCount || 0,
                columns
            })
        }

        return {
            success: true,
            sheets
        }
    } catch (error) {
        console.error('getAllSheetsInfo failed:', error)
        return {
            success: false,
            error: String(error),
            message: '获取工作表信息时发生错误'
        }
    }
}

/**
 * 在工作表中搜索内容（等价于 AirScript 的 searchInSheet）
 */
export async function searchInSheet(
    tokenValue: string,
    spreadsheetId: string,
    sheetName: string,
    searchValue: string,
    searchColumn?: number,
    maxResults?: number
) {
    if (!sheetName) {
        return { success: false, error: '缺少参数: sheetName', message: '请提供工作表名称' }
    }
    if (!searchValue && searchValue !== '0') {
        return { success: false, error: '缺少参数: searchValue', message: '请提供搜索值' }
    }

    try {
        const auth = await resolveAuth(tokenValue)
        const allValues = await getSheetValues(spreadsheetId, `'${sheetName}'`, auth)

        if (allValues.length === 0) {
            return {
                success: true,
                sheetName,
                searchValue,
                totalCount: 0,
                results: [],
                message: '工作表为空'
            }
        }

        const headerRow = allValues[0]
        const limit = Math.min(Math.max(1, maxResults || 100), 500)
        const results: Array<{
            row: number
            column: number
            address: string
            value: string
            rowData: Record<string, string>
        }> = []

        const searchStr = String(searchValue)

        for (let rowIdx = 1; rowIdx < allValues.length; rowIdx++) {
            const row = allValues[rowIdx]

            const startCol = searchColumn && searchColumn > 0 ? searchColumn - 1 : 0
            const endCol = searchColumn && searchColumn > 0 ? searchColumn : row.length

            for (let colIdx = startCol; colIdx < endCol; colIdx++) {
                const cellValue = row[colIdx] || ''
                if (String(cellValue).includes(searchStr)) {
                    // 收集整行数据
                    const rowData: Record<string, string> = {}
                    for (let c = 0; c < headerRow.length; c++) {
                        rowData[columnToLetter(c + 1)] = row[c] || ''
                    }

                    results.push({
                        row: rowIdx + 1,
                        column: colIdx + 1,
                        address: `${columnToLetter(colIdx + 1)}${rowIdx + 1}`,
                        value: cellValue,
                        rowData
                    })

                    if (results.length >= limit) break
                }
            }
            if (results.length >= limit) break
        }

        return {
            success: true,
            sheetName,
            searchValue,
            searchColumn: searchColumn || 'all',
            totalCount: results.length,
            results
        }
    } catch (error) {
        console.error('searchInSheet failed:', error)
        return {
            success: false,
            error: String(error),
            message: '搜索时发生错误'
        }
    }
}

/**
 * 获取指定区域的数据（等价于 AirScript 的 getRangeData）
 */
export async function getRangeData(
    tokenValue: string,
    spreadsheetId: string,
    sheetName: string,
    rangeAddress?: string,
    hasHeader?: boolean
) {
    if (!sheetName) {
        return { success: false, error: '缺少参数: sheetName', message: '请提供工作表名称' }
    }

    try {
        const auth = await resolveAuth(tokenValue)
        const range = rangeAddress
            ? `'${sheetName}'!${rangeAddress}`
            : `'${sheetName}'`

        const allValues = await getSheetValues(spreadsheetId, range, auth)

        if (allValues.length === 0) {
            return {
                success: true,
                sheetName,
                columns: [],
                rows: [],
                message: '指定区域为空'
            }
        }

        const useHeader = hasHeader !== false
        let columns: string[]

        if (useHeader && allValues.length > 0) {
            columns = allValues[0].map((h, idx) => h || `列${idx + 1}`)
        } else {
            columns = allValues[0].map((_, idx) => columnToLetter(idx + 1))
        }

        const dataStartRow = useHeader ? 1 : 0
        const maxRows = Math.min(allValues.length, 1001)
        const rows: Record<string, string>[] = []

        for (let row = dataStartRow; row < maxRows; row++) {
            const rowData: Record<string, string> = {}
            for (let col = 0; col < columns.length; col++) {
                rowData[columns[col]] = allValues[row]?.[col] || ''
            }
            rows.push(rowData)
        }

        return {
            success: true,
            sheetName,
            range: rangeAddress || 'UsedRange',
            columns,
            rowCount: rows.length,
            rows
        }
    } catch (error) {
        console.error('getRangeData failed:', error)
        return {
            success: false,
            error: String(error),
            message: '获取数据时发生错误'
        }
    }
}

/**
 * 多条件 AND 搜索（等价于 AirScript 的 searchMultiCriteria）
 * 
 * 将整个工作表数据拉到服务端内存中，然后在内存中进行多条件匹配。
 * 对于大表（>10000行），会自动截断以避免超时。
 */
export async function searchMultiCriteria(
    tokenValue: string,
    spreadsheetId: string,
    sheetName: string,
    criteria: SearchCriteria[],
    returnColumns?: string[]
) {
    if (!sheetName) {
        return { success: false, error: '缺少参数: sheetName', message: '请提供工作表名称' }
    }
    if (!criteria || !Array.isArray(criteria) || criteria.length === 0) {
        return { success: false, error: '缺少参数: criteria', message: '请提供至少一个搜索条件' }
    }

    try {
        const auth = await resolveAuth(tokenValue)
        const allValues = await getSheetValues(spreadsheetId, `'${sheetName}'`, auth)

        if (allValues.length <= 1) {
            return {
                success: true,
                sheetName,
                totalCount: 0,
                records: [],
                message: '工作表为空'
            }
        }

        // 建立表头映射
        const headerRow = allValues[0]
        const columnMap: Record<string, number> = {}
        const nameCounts: Record<string, number> = {}

        for (let i = 0; i < headerRow.length; i++) {
            let colName = headerRow[i] || columnToLetter(i + 1)

            if (nameCounts[colName]) {
                nameCounts[colName]++
                colName = `${colName}-${nameCounts[colName]}`
            } else {
                nameCounts[colName] = 1
            }

            columnMap[colName] = i
        }

        const allColumns = Object.keys(columnMap)

        // 验证条件中的列名
        const validCriteria: Array<{
            columnName: string
            colIndex: number
            searchValue: string
            opType: string
        }> = []
        const criteriaDescriptions: string[] = []

        for (const crit of criteria) {
            const columnName = crit.columnName
            if (!columnName) continue

            if (columnMap[columnName] === undefined) {
                return {
                    success: false,
                    error: '未找到列: ' + columnName,
                    message: '请检查列名称是否正确',
                    sheetName,
                    availableColumns: allColumns
                }
            }

            const opType = crit.op || 'Contains'
            const searchValue = crit.searchValue || ''

            validCriteria.push({
                columnName,
                colIndex: columnMap[columnName],
                searchValue,
                opType
            })
            criteriaDescriptions.push(`${columnName} ${opType} '${searchValue}'`)
        }

        if (validCriteria.length === 0) {
            return {
                success: false,
                error: '没有有效的搜索条件',
                message: '请提供至少一个有效的搜索条件'
            }
        }

        // 确定输出列
        let outputColumns = allColumns
        if (returnColumns && Array.isArray(returnColumns) && returnColumns.length > 0) {
            const validReturnCols = returnColumns.filter(c => columnMap[c] !== undefined)
            if (validReturnCols.length > 0) {
                outputColumns = validReturnCols
            }
        }

        // 在内存中搜索
        const records: Record<string, unknown>[] = []
        const MAX_RECORDS = 100
        let truncated = false

        for (let rowIdx = 1; rowIdx < allValues.length; rowIdx++) {
            const row = allValues[rowIdx]
            let matchAll = true

            for (const crit of validCriteria) {
                const cellValue = row[crit.colIndex] || ''
                const cellStr = String(cellValue)
                const searchStr = String(crit.searchValue)

                if (!searchStr) continue

                if (cellStr.indexOf(searchStr) === -1) {
                    matchAll = false
                    break
                }
            }

            if (matchAll) {
                const rowData: Record<string, unknown> = {}
                for (const colName of outputColumns) {
                    const idx = columnMap[colName]
                    rowData[colName] = row[idx] !== undefined ? row[idx] : null
                }
                records.push(rowData)

                if (records.length >= MAX_RECORDS) {
                    truncated = true
                    break
                }
            }
        }

        return {
            success: true,
            sheetName,
            criteriaCount: validCriteria.length,
            criteriaDescription: criteriaDescriptions.join(' AND '),
            totalCount: records.length,
            truncated,
            maxRecords: MAX_RECORDS,
            records
        }
    } catch (error) {
        console.error('searchMultiCriteria failed:', error)
        return {
            success: false,
            error: String(error),
            message: '搜索时发生错误'
        }
    }
}

/**
 * 批量搜索（等价于 AirScript 的 searchBatch）
 * 
 * 一次加载工作表数据，然后对多组条件逐一匹配，避免重复拉取。
 */
export async function searchBatch(
    tokenValue: string,
    spreadsheetId: string,
    sheetName: string,
    batchCriteria: BatchCriteriaItem[],
    returnColumns?: string[]
) {
    if (!sheetName) {
        return { success: false, error: '缺少参数: sheetName', message: '请提供工作表名称' }
    }
    if (!batchCriteria || !Array.isArray(batchCriteria) || batchCriteria.length === 0) {
        return { success: false, error: '缺少参数: batchCriteria', message: '请提供批量查询条件' }
    }

    try {
        const auth = await resolveAuth(tokenValue)
        const allValues = await getSheetValues(spreadsheetId, `'${sheetName}'`, auth)

        if (allValues.length <= 1) {
            return {
                success: true,
                sheetName,
                totalQueries: batchCriteria.length,
                totalMatches: 0,
                results: batchCriteria.map((item, i) => ({
                    id: item.id || `q_${i}`,
                    success: true,
                    records: [],
                    truncated: false
                }))
            }
        }

        // 建立表头映射
        const headerRow = allValues[0]
        const columnMap: Record<string, number> = {}
        const nameCounts: Record<string, number> = {}

        for (let i = 0; i < headerRow.length; i++) {
            let colName = headerRow[i] || columnToLetter(i + 1)
            if (nameCounts[colName]) {
                nameCounts[colName]++
                colName = `${colName}-${nameCounts[colName]}`
            } else {
                nameCounts[colName] = 1
            }
            columnMap[colName] = i
        }

        const allColumns = Object.keys(columnMap)

        // 确定输出列
        let outputColumns = allColumns
        if (returnColumns && Array.isArray(returnColumns) && returnColumns.length > 0) {
            const validReturnCols = returnColumns.filter(c => columnMap[c] !== undefined)
            if (validReturnCols.length > 0) {
                outputColumns = validReturnCols
            }
        }

        const batchResults: Array<{
            id: string
            success: boolean
            records: Record<string, unknown>[]
            truncated: boolean
            error?: string
        }> = []
        let totalMatchCount = 0

        for (let i = 0; i < batchCriteria.length; i++) {
            const queryItem = batchCriteria[i]
            const queryId = queryItem.id || `q_${i}`
            const criteria = queryItem.criteria

            if (!criteria || criteria.length === 0) {
                batchResults.push({ id: queryId, success: false, records: [], truncated: false, error: '无搜索条件' })
                continue
            }

            // 验证条件列
            const validCriteria: Array<{ colIndex: number; searchValue: string; opType: string }> = []
            let invalid = false

            for (const crit of criteria) {
                if (!crit.columnName || columnMap[crit.columnName] === undefined) continue
                const searchValue = crit.searchValue || ''
                validCriteria.push({
                    colIndex: columnMap[crit.columnName],
                    searchValue,
                    opType: crit.op || 'Contains'
                })
            }

            if (validCriteria.length === 0) {
                batchResults.push({ id: queryId, success: false, records: [], truncated: false, error: '条件无效' })
                continue
            }

            const records: Record<string, unknown>[] = []
            const MAX_RECORDS = 30

            for (let rowIdx = 1; rowIdx < allValues.length; rowIdx++) {
                const row = allValues[rowIdx]
                let matchAll = true

                for (const crit of validCriteria) {
                    const cellValue = row[crit.colIndex] || ''
                    const cellStr = String(cellValue)
                    const searchStr = String(crit.searchValue)

                    if (!searchStr) continue
                    if (cellStr.indexOf(searchStr) === -1) {
                        matchAll = false
                        break
                    }
                }

                if (matchAll) {
                    const rowData: Record<string, unknown> = {}
                    for (const colName of outputColumns) {
                        const idx = columnMap[colName]
                        rowData[colName] = row[idx] !== undefined ? row[idx] : null
                    }
                    records.push(rowData)
                    if (records.length >= MAX_RECORDS) break
                }
            }

            totalMatchCount += records.length
            batchResults.push({
                id: queryId,
                success: true,
                records,
                truncated: records.length >= MAX_RECORDS
            })
        }

        return {
            success: true,
            sheetName,
            totalQueries: batchCriteria.length,
            totalMatches: totalMatchCount,
            results: batchResults
        }
    } catch (error) {
        console.error('searchBatch failed:', error)
        return {
            success: false,
            error: String(error),
            message: '批量搜索执行失败'
        }
    }
}

/**
 * 根据 action 派发请求（统一入口，与 WPS AirScript 的 action 路由匹配）
 */
export async function handleGoogleSheetsAction(
    tokenValue: string,
    spreadsheetId: string,
    argv: Record<string, unknown>
): Promise<Record<string, unknown>> {
    const action = (argv.action as string) || 'getAll'

    switch (action) {
        case 'getAll':
            return await getAllSheetsInfo(tokenValue, spreadsheetId)

        case 'search':
            return await searchInSheet(
                tokenValue,
                spreadsheetId,
                argv.sheetName as string,
                argv.searchValue as string,
                argv.searchColumn as number | undefined,
                argv.maxResults as number | undefined
            )

        case 'searchMulti':
            return await searchMultiCriteria(
                tokenValue,
                spreadsheetId,
                argv.sheetName as string,
                argv.criteria as SearchCriteria[],
                argv.returnColumns as string[] | undefined
            )

        case 'getData':
            return await getRangeData(
                tokenValue,
                spreadsheetId,
                argv.sheetName as string,
                argv.range as string | undefined,
                argv.hasHeader as boolean | undefined
            )

        case 'searchBatch':
            return await searchBatch(
                tokenValue,
                spreadsheetId,
                argv.sheetName as string,
                argv.batchCriteria as BatchCriteriaItem[],
                argv.returnColumns as string[] | undefined
            )

        case 'getImageUrl':
            // Google Sheets 不支持单元格图片 URL 获取
            return {
                success: true,
                sheetName: argv.sheetName as string,
                requestedCount: 0,
                successCount: 0,
                imageUrls: {},
                message: 'Google Sheets 不支持单元格图片获取'
            }

        default:
            return {
                success: false,
                error: '未知操作: ' + action,
                message: '支持的操作: getAll, search, searchMulti, searchBatch, getData'
            }
    }
}
