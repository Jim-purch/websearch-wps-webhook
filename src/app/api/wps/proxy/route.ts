import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { WpsLogger } from '@/lib/wps-logger'
import { handleGoogleSheetsAction, getGoogleSheetsCacheTime } from '@/lib/googlesheets'
import { parseWpsResponse } from '@/lib/wps/parser'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { WpsQueueManager } from '@/lib/wps/queue'
import crypto from 'crypto'

/**
 * WPS Webhook 代理 API
 * 解决浏览器 CORS 限制问题
 */
export async function POST(request: NextRequest) {
    try {
        // 验证用户身份
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: '未授权' },
                { status: 401 }
            )
        }

        const body = await request.json()
        const { tokenId, argv } = body

        if (!tokenId || !argv) {
            return NextResponse.json(
                { success: false, error: '缺少必要参数' },
                { status: 400 }
            )
        }

        let token: { name: string; webhook_url: string; token_value: string } | null = null
        let presetFilter: { selected_table_names: string[]; column_configs: Record<string, any[]> } | null = null
        const action = argv.action

        // 1. 获取 Token 信息 (支持预设分享拦截)
        if (typeof tokenId === 'string' && tokenId.startsWith('preset::')) {
            const presetId = tokenId.replace('preset::', '')
            
            // 使用当前用户 client（遵循 RLS）查询预设详情，从而验证用户是否有该预设的查看权限
            const { data: presetData, error: presetError } = await supabase
                .from('search_presets')
                .select('id, token_id, selected_table_names, columns_data, column_configs')
                .eq('id', presetId)
                .single()

            if (presetError || !presetData) {
                return NextResponse.json(
                    { success: false, error: '没有该预设的使用权限或预设不存在' },
                    { status: 403 }
                )
            }

            // 如果是 getAll，直接从预设的 columns_data 中构造返回，不需要请求远程 WPS/GS API
            if (action === 'getAll') {
                const columnsData = (presetData.columns_data as Record<string, any>) || {}
                const columnConfigs = (presetData.column_configs as Record<string, any>) || {}
                const selectedTableNames = Array.isArray(presetData.selected_table_names) ? presetData.selected_table_names : []
                
                // 为了获取 Google Sheets 的缓存时间，我们需要拉取关联 of token 信息
                let isGoogleSheets = false
                let spreadsheetId = ''
                
                const adminSupabase = createSupabaseClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.SUPABASE_SERVICE_ROLE_KEY!
                )
                const { data: tokenData } = await adminSupabase
                    .from('tokens')
                    .select('webhook_url')
                    .eq('id', presetData.token_id)
                    .single()
                
                if (tokenData && tokenData.webhook_url?.startsWith('gsheet://')) {
                    isGoogleSheets = true
                    spreadsheetId = tokenData.webhook_url.replace('gsheet://', '').trim()
                }

                // 收集所有关联的原始 Token ID 并批量查出对应的 Webhook
                const uniqueTokenIds = new Set<string>()
                for (const fullTableKey of Object.keys(columnsData)) {
                    if (!selectedTableNames.includes(fullTableKey)) continue
                    let targetTokenId = presetData.token_id
                    if (fullTableKey.includes('::')) {
                        if (!fullTableKey.startsWith('preset::')) {
                            const index = fullTableKey.indexOf('::')
                            targetTokenId = fullTableKey.slice(0, index)
                        }
                    }
                    uniqueTokenIds.add(targetTokenId)
                }

                const { data: tokensList } = await adminSupabase
                    .from('tokens')
                    .select('id, webhook_url')
                    .in('id', Array.from(uniqueTokenIds))

                const tokenUrlMap: Record<string, string> = {}
                if (tokensList) {
                    for (const t of tokensList) {
                        tokenUrlMap[t.id] = t.webhook_url || ''
                    }
                }

                const tables: any[] = []
                for (const fullTableKey of Object.keys(columnsData)) {
                    if (!selectedTableNames.includes(fullTableKey)) continue
                    
                    const tableName = extractTableName(fullTableKey)
                    if (tableName === '') continue

                    // 确定该数据表的队列唯一标识 (哈希值)
                    let targetTokenId = presetData.token_id
                    if (fullTableKey.includes('::')) {
                        if (!fullTableKey.startsWith('preset::')) {
                            const index = fullTableKey.indexOf('::')
                            targetTokenId = fullTableKey.slice(0, index)
                        }
                    }
                    const url = tokenUrlMap[targetTokenId] || ''
                    const queueKey = url ? crypto.createHash('sha256').update(url).digest('hex') : targetTokenId
                    
                    const configs = columnConfigs[fullTableKey] || []
                    const allowedCols = configs.filter((c: any) => c.fetch).map((c: any) => c.name)
                    
                    const tableObj: any = {
                        name: tableName,
                        columns: allowedCols.length > 0 ? allowedCols : (columnsData[fullTableKey] || []).map((c: any) => typeof c === 'string' ? c : c.name),
                        webhookQueueKey: queueKey
                    }

                    if (isGoogleSheets && spreadsheetId) {
                        tableObj.cacheTime = getGoogleSheetsCacheTime(spreadsheetId, tableName)
                    }

                    tables.push(tableObj)
                }
                
                return NextResponse.json({
                    success: true,
                    data: {
                        result: JSON.stringify({ tables })
                    }
                })
            }

            // 对于其他行为 (searchMulti, searchBatch, updateRow等)，动态定位数据表对应的原始 Token ID
            let targetTokenId = presetData.token_id
            const sheetName = argv.sheetName
            if (sheetName) {
                const columnsData = (presetData.columns_data as Record<string, any>) || {}
                const matchedKey = Object.keys(columnsData).find(key => {
                    const name = extractTableName(key)
                    return name === sheetName
                })
                if (matchedKey) {
                    if (matchedKey.includes('::')) {
                        if (matchedKey.startsWith('preset::')) {
                            const adminSupabase = createSupabaseClient(
                                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                                process.env.SUPABASE_SERVICE_ROLE_KEY!
                            )
                            const remaining = matchedKey.slice(8)
                            const index = remaining.indexOf('::')
                            const refPresetId = index !== -1 ? remaining.slice(0, index) : remaining
                            
                            const { data: refPreset } = await adminSupabase
                                .from('search_presets')
                                .select('token_id')
                                .eq('id', refPresetId)
                                .single()
                            
                            if (refPreset?.token_id) {
                                targetTokenId = refPreset.token_id
                            }
                        } else {
                            const index = matchedKey.indexOf('::')
                            targetTokenId = matchedKey.slice(0, index)
                        }
                    }
                }
            }

            // 使用 Service Role Client 获取所属 Token 的敏感信息，避免暴露给客户端 RPC
            const adminSupabase = createSupabaseClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            )
            const { data: tokenData, error: tokenError } = await adminSupabase
                .from('tokens')
                .select('name, webhook_url, token_value')
                .eq('id', targetTokenId)
                .single()

            if (tokenError || !tokenData) {
                return NextResponse.json(
                    { success: false, error: '预设所关联的 Token 不存在或已失效' },
                    { status: 404 }
                )
            }

            token = {
                name: tokenData.name,
                webhook_url: tokenData.webhook_url,
                token_value: tokenData.token_value
            }

            const rawTableNames = Array.isArray(presetData.selected_table_names) ? presetData.selected_table_names : []
            // 把 presetFilter 里的 selected_table_names 做映射，使得 sheetName 直接匹配
            const allowedTables = rawTableNames.map((name: string) => {
                return extractTableName(name)
            }).filter((name: string) => name !== '')

            // 同样需要映射 column_configs 的键，使得匹配 sheetName 时不需要带有前缀
            const mappedConfigs: Record<string, any[]> = {}
            const rawConfigs = (presetData.column_configs as Record<string, any[]>) || {}
            for (const [key, val] of Object.entries(rawConfigs)) {
                const name = extractTableName(key)
                if (name !== '') {
                    mappedConfigs[name] = val
                }
            }

            presetFilter = {
                selected_table_names: allowedTables,
                column_configs: mappedConfigs
            }
        } else {
            // 从数据库获取 Token 信息 (普通 Token)
            const { data: tokenData, error: tokenError } = await supabase
                .from('tokens')
                .select('name, webhook_url, token_value')
                .eq('id', tokenId)
                .single()

            if (tokenError || !tokenData) {
                return NextResponse.json(
                    { success: false, error: 'Token 不存在' },
                    { status: 404 }
                )
            }
            token = tokenData
        }

        if (!token.webhook_url) {
            return NextResponse.json(
                { success: false, error: 'Token 没有配置 Webhook URL' },
                { status: 400 }
            )
        }

        // ==========================================
        // 预设权限限制验证
        // ==========================================
        if (presetFilter) {
            const action = argv.action
            if (action !== 'getAll') {
                // 预设模式下禁用 setCellValue 和 setRangeValues，以防通过行列物理地址绕过字段限制
                if (action === 'setCellValue' || action === 'setRangeValues') {
                    return NextResponse.json(
                        { success: false, error: '预设限制模式下不支持直接设定单元格/区域值，请使用受控的行更新' },
                        { status: 403 }
                    )
                }

                const sheetName = argv.sheetName
                if (!sheetName || !presetFilter.selected_table_names.includes(sheetName)) {
                    return NextResponse.json(
                        { success: false, error: `无权访问数据表: ${sheetName || '未指定'}` },
                        { status: 403 }
                    )
                }

                // 获取该表允许的列名
                const configs = presetFilter.column_configs[sheetName] || []
                const allowedCols = configs.filter((c: any) => c.fetch).map((c: any) => c.name)

                // 验证 searchMulti 查询字段
                if (action === 'searchMulti' && Array.isArray(argv.criteria)) {
                    for (const crit of argv.criteria) {
                        if (!allowedCols.includes(crit.columnName)) {
                            return NextResponse.json(
                                { success: false, error: `无权检索字段: ${crit.columnName}` },
                                { status: 403 }
                            )
                        }
                    }
                    // 强制指定返回列为允许的列
                    argv.returnColumns = allowedCols
                }

                // 验证 searchBatch 查询字段
                if (action === 'searchBatch' && Array.isArray(argv.batchCriteria)) {
                    for (const item of argv.batchCriteria) {
                        if (Array.isArray(item.criteria)) {
                            for (const crit of item.criteria) {
                                if (!allowedCols.includes(crit.columnName)) {
                                    return NextResponse.json(
                                        { success: false, error: `无权检索字段: ${crit.columnName}` },
                                        { status: 403 }
                                    )
                                }
                            }
                        }
                    }
                    // 强制指定返回列为允许的列
                    argv.returnColumns = allowedCols
                }

                // 验证 updateRow 修改字段
                if (action === 'updateRow' && argv.rowData) {
                    for (const colName of Object.keys(argv.rowData)) {
                        if (!allowedCols.includes(colName)) {
                            return NextResponse.json(
                                { success: false, error: `无权修改字段: ${colName}` },
                                { status: 403 }
                            )
                        }
                    }
                }
            }
        }

        // ==========================================
        // 日志记录逻辑 (不阻塞主线程失败，但需等待完成以保证Serverless环境执行)
        // ==========================================
        try {
            const action = argv.action
            const userName = user.user_metadata?.display_name || '未设置'
            const userEmail = user.email || '未知'
            const timeStr = new Date().toLocaleString('zh-CN')
            const tokenName = token.name || '未命名Token'

            if (action === 'searchMulti') {
                const criteria = argv.criteria || []
                let criteriaStr = ''
                let fieldsStr = ''
                let valuesStr = ''

                if (Array.isArray(criteria)) {
                    criteriaStr = criteria.map((c: any) => `${c.columnName} ${c.op} ${c.searchValue}`).join('; ')
                    fieldsStr = criteria.map((c: any) => c.columnName).join(', ')
                    valuesStr = criteria.map((c: any) => c.searchValue).join(', ')
                }

                await WpsLogger.log('search', {
                    '用户名': userName,
                    '邮箱': userEmail,
                    '操作时间': timeStr,
                    '使用token名称': tokenName,
                    '选择数据表': argv.sheetName,
                    '选择字段名称': fieldsStr,
                    '搜索值': valuesStr,
                    '对应的记录值': `Sheet: ${argv.sheetName}, 查询: ${criteriaStr}`
                })
            } else if (action === 'searchBatch') {
                const batchCriteria = argv.batchCriteria || []
                const count = Array.isArray(batchCriteria) ? batchCriteria.length : 0

                // 提取字段名 and 搜索值摘要
                let fieldsStr = ''
                let valuesStr = ''
                if (count > 0 && batchCriteria[0].criteria) {
                    if (argv.isSameValueSearch) {
                        const sameValueCols = (argv.sameValueCols as string[]) || []
                        const sameValueValues = (argv.sameValueValues as string[]) || []
                        
                        // 提取独立过滤条件对应的字段和搜索值
                        const firstItemCriteria = batchCriteria[0].criteria || []
                        const independentCriteria = firstItemCriteria.filter(
                            (c: any) => !sameValueCols.includes(c.columnName)
                        )
                        const independentCols = independentCriteria.map((c: any) => c.columnName)
                        const independentValues = independentCriteria.map((c: any) => c.searchValue)
                        
                        const allCols = [...sameValueCols, ...independentCols]
                        fieldsStr = allCols.join(', ')
                        
                        valuesStr = sameValueValues.join(', ')
                        if (independentValues.length > 0) {
                            valuesStr += ' & ' + independentValues.join('&')
                        }
                    } else {
                        fieldsStr = batchCriteria[0].criteria.map((c: any) => c.columnName).join(', ')
                        const allValues = batchCriteria.map((item: any) => {
                            return item.criteria ? item.criteria.map((c: any) => c.searchValue).join('&') : ''
                        }).filter((v: string) => v)
                        valuesStr = allValues.join(', ')
                    }
                }

                const logPayload: Record<string, any> = {
                    '用户名': userName,
                    '邮箱': userEmail,
                    '操作时间': timeStr,
                    '使用token名称': tokenName,
                    '选择数据表': argv.sheetName,
                    '选择字段名称': fieldsStr,
                    '对应的记录值': `Sheet: ${argv.sheetName}, 批量查询数量: ${count}`
                }

                const CHUNK_SIZE = 2000
                if (!valuesStr) {
                    logPayload['搜索值'] = ''
                } else if (valuesStr.length <= CHUNK_SIZE) {
                    logPayload['搜索值'] = valuesStr
                } else {
                    let currentVal = valuesStr
                    let idx = 0
                    while (currentVal.length > 0) {
                        const chunk = currentVal.substring(0, CHUNK_SIZE)
                        currentVal = currentVal.substring(CHUNK_SIZE)
                        const key = idx === 0 ? '搜索值' : `搜索值${idx}`
                        logPayload[key] = chunk
                        idx++
                    }
                }

                await WpsLogger.log('batch', logPayload)
            } else if (action === 'updateRow') {
                const { sheetName, rowIndex, rowData, oldRowData } = argv
                const changedCols = Object.keys(rowData || {})
                for (const col of changedCols) {
                    const newValue = rowData[col]
                    const oldValue = oldRowData ? oldRowData[col] : undefined

                    if (String(newValue) !== String(oldValue ?? '')) {
                        await WpsLogger.log('history', {
                            '原纪录': String(oldValue ?? ''),
                            '新纪录': String(newValue ?? ''),
                            '表': tokenName,
                            'sheet': sheetName || '未知',
                            '行': rowIndex || '未知',
                            '用户名': userName,
                            '时间': timeStr,
                            '操作行为': `修改单元格 [${col}]`
                        })
                    }
                }
            } else if (action === 'setCellValue') {
                const { sheetName, cellAddress, value, oldValue } = argv
                if (String(value) !== String(oldValue ?? '')) {
                    await WpsLogger.log('history', {
                        '原纪录': String(oldValue ?? ''),
                        '新纪录': String(value ?? ''),
                        '表': tokenName,
                        'sheet': sheetName || '未知',
                        '行': cellAddress || '未知',
                        '用户名': userName,
                        '时间': timeStr,
                        '操作行为': '修改单元格'
                    })
                }
            } else if (action === 'setRangeValues') {
                const { sheetName, rangeAddress, values, oldValues } = argv
                await WpsLogger.log('history', {
                    '原纪录': oldValues ? JSON.stringify(oldValues) : '',
                    '新纪录': values ? JSON.stringify(values) : '',
                    '表': tokenName,
                    'sheet': sheetName || '未知',
                    '行': rangeAddress || '未知',
                    '用户名': userName,
                    '时间': timeStr,
                    '操作行为': '批量修改单元格'
                })
            } else if (action === 'deleteRows') {
                const { sheetName, rowNumbers, oldRowsData } = argv
                const rows = Array.isArray(rowNumbers) ? rowNumbers : []
                for (let i = 0; i < rows.length; i++) {
                    const rowNum = rows[i]
                    const oldRow = oldRowsData?.[i]
                    const oldRowStr = oldRow ? JSON.stringify(oldRow) : ''
                    await WpsLogger.log('history', {
                        '原纪录': oldRowStr,
                        '新纪录': '',
                        '表': tokenName,
                        'sheet': sheetName || '未知',
                        '行': rowNum || '未知',
                        '用户名': userName,
                        '时间': timeStr,
                        '操作行为': '删除行'
                    })
                }
            }
        } catch (logErr) {
            console.error('WPS Log Error:', logErr)
        }
        // ==========================================

        // ==========================================
        // 根据 Token 类型分流：Google Sheets 或 WPS
        // ==========================================
        const isGoogleSheets = token.webhook_url.startsWith('gsheet://')

        if (isGoogleSheets) {
            // Google Sheets 模式
            const spreadsheetId = token.webhook_url.replace('gsheet://', '').trim()
            if (!spreadsheetId) {
                return NextResponse.json(
                    { success: false, error: 'Google Sheets Spreadsheet ID 无效' },
                    { status: 400 }
                )
            }

            const gsResult = await handleGoogleSheetsAction(
                token.token_value,
                spreadsheetId,
                argv
            )

            let finalGsResult = gsResult
            if (presetFilter) {
                finalGsResult = filterResponseData(argv.action, gsResult, presetFilter)
            }

            return NextResponse.json({
                data: {
                    result: JSON.stringify(finalGsResult)
                }
            })
        }

        // WPS 模式（含 403/500 自动重试和分批回退，对客户端透明）
        const wpsCallResult = await executeWpsCallWithFallback(
            token.webhook_url,
            token.token_value,
            argv
        )

        if (!wpsCallResult.ok) {
            return NextResponse.json(
                {
                    success: false,
                    error: wpsCallResult.error
                },
                { status: wpsCallResult.status }
            )
        }

        const wpsData = wpsCallResult.data

        let finalWpsData = wpsData
        if (presetFilter) {
            finalWpsData = filterWpsResponse(argv.action, wpsData, presetFilter)
        } else if (argv.action === 'getAll') {
            const parsed = parseWpsResponse<any>(wpsData)
            if (parsed.success && parsed.data) {
                const tables = parsed.data.tables || parsed.data.sheets || []
                const queueKey = crypto.createHash('sha256').update(token.webhook_url).digest('hex')
                for (const t of tables) {
                    t.webhookQueueKey = queueKey
                }
                finalWpsData = {
                    data: {
                        result: JSON.stringify(parsed.data)
                    }
                }
            }
        }

        return NextResponse.json(finalWpsData)

    } catch (err) {
        console.error('WPS Proxy Error:', err)
        return NextResponse.json(
            {
                success: false,
                error: err instanceof Error ? err.message : '代理请求失败'
            },
            { status: 500 }
        )
    }
}

/**
 * 过滤 WPS 响应结果 (针对序列化 JSON 的 WPS 格式)
 */
function filterWpsResponse(action: string, wpsData: any, presetFilter: any) {
    const parsed = parseWpsResponse<any>(wpsData)
    if (!parsed.success || !parsed.data) {
        return wpsData
    }

    const filteredData = filterResponseData(action, parsed.data, presetFilter)

    return {
        data: {
            result: JSON.stringify(filteredData)
        }
    }
}

/**
 * 过滤结构化响应数据
 */
function filterResponseData(action: string, data: any, presetFilter: any) {
    if (!data) return data

    if (action === 'getAll') {
        const tables = data.tables || data.sheets || []
        const filteredTables = tables
            .filter((table: any) => presetFilter.selected_table_names.includes(table.name))
            .map((table: any) => {
                const configs = presetFilter.column_configs[table.name] || []
                const allowedCols = configs.filter((c: any) => c.fetch).map((c: any) => c.name)

                const filteredColumns = (table.columns || []).filter((col: any) => {
                    const colName = typeof col === 'string' ? col : col.name
                    return allowedCols.includes(colName)
                })

                return {
                    ...table,
                    columns: filteredColumns
                }
            })

        return data.tables ? { ...data, tables: filteredTables } : { ...data, sheets: filteredTables }
    } else if (action === 'getData') {
        const sheetName = data.sheetName || ''
        const configs = presetFilter.column_configs[sheetName] || []
        const allowedCols = configs.filter((c: any) => c.fetch).map((c: any) => c.name)

        let filteredColumns = data.columns || []
        if (Array.isArray(data.columns)) {
            filteredColumns = data.columns.filter((c: any) => {
                const colName = typeof c === 'string' ? c : c.name
                return allowedCols.includes(colName)
            })
        }
        let filteredTableColumns = data.table?.columns || []
        if (data.table?.columns) {
            filteredTableColumns = data.table.columns.filter((c: any) => allowedCols.includes(c.name))
        }

        return {
            ...data,
            columns: filteredColumns,
            table: data.table ? { ...data.table, columns: filteredTableColumns } : undefined
        }
    } else if (action === 'searchMulti') {
        const sheetName = data.sheetName || ''
        const configs = presetFilter.column_configs[sheetName] || []
        const allowedCols = configs.filter((c: any) => c.fetch).map((c: any) => c.name)

        let filteredRecords = data.records || []
        if (Array.isArray(data.records)) {
            filteredRecords = data.records.map((record: Record<string, unknown>) => filterSingleRecord(record, allowedCols))
        }
        return {
            ...data,
            records: filteredRecords
        }
    } else if (action === 'searchBatch') {
        const sheetName = data.sheetName || ''
        const configs = presetFilter.column_configs[sheetName] || []
        const allowedCols = configs.filter((c: any) => c.fetch).map((c: any) => c.name)

        let filteredResults = data.results || []
        if (Array.isArray(data.results)) {
            filteredResults = data.results.map((res: any) => {
                if (Array.isArray(res.records)) {
                    const filteredRecords = res.records.map((record: Record<string, unknown>) => filterSingleRecord(record, allowedCols))
                    return { ...res, records: filteredRecords }
                }
                return res
            })
        }
        return {
            ...data,
            results: filteredResults
        }
    }

    return data
}

/**
 * 过滤单条记录的字段（自动兼容多维表格 fields 嵌套及普通表格扁平结构）
 */
function filterSingleRecord(
    record: Record<string, unknown> | null | undefined,
    allowedCols: string[]
): Record<string, unknown> | null | undefined {
    if (!record) return record

    const hasFields = !!(record.fields && typeof record.fields === 'object')
    const targetSource = hasFields 
        ? (record.fields as Record<string, unknown>) 
        : record

    const filteredSource: Record<string, unknown> = {}
    for (const col of allowedCols) {
        if (targetSource && col in targetSource) {
            filteredSource[col] = targetSource[col]
        }
    }

    if (hasFields) {
        return {
            ...record,
            fields: filteredSource
        }
    } else {
        const result: Record<string, unknown> = { ...filteredSource }
        if ('_rowNumber' in record) result['_rowNumber'] = record['_rowNumber']
        if ('rowNumber' in record) result['rowNumber'] = record['rowNumber']
        if ('id' in record) result['id'] = record['id']
        return result
    }
}

/**
 * 从不同前缀格式的表主键中提取纯净的表名 (如: preset::[id]::Sheet1 或 token-123::Sheet1 -> Sheet1)
 */
function extractTableName(fullKey: string): string {
    if (fullKey.startsWith('token::')) {
        return '';
    }
    if (fullKey.startsWith('preset::')) {
        const remaining = fullKey.slice(8); // remove 'preset::'
        const index = remaining.indexOf('::');
        return index !== -1 ? remaining.slice(index + 2) : remaining;
    }
    if (fullKey.includes('::')) {
        const index = fullKey.indexOf('::');
        return fullKey.slice(index + 2);
    }
    return fullKey;
}

// ==========================================
// WPS Webhook 调用（含 403/500 自动重试和分批回退）
// ==========================================

/** 可重试的 HTTP 状态码 */
const RETRYABLE_STATUS = new Set([403, 500])

/** 分批回退时每批的最大查询条数 */
const FALLBACK_CHUNK_SIZE = 10

/**
 * 调用 WPS Webhook（通过队列串行执行，含抖动延迟）
 */
async function callWpsWebhook(
    webhookUrl: string,
    tokenValue: string,
    argv: Record<string, unknown>
): Promise<Response> {
    return WpsQueueManager.enqueue(webhookUrl, async () => {
        const jitterMs = Math.floor(Math.random() * 251) + 50
        await new Promise(resolve => setTimeout(resolve, jitterMs))
        return fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'AirScript-Token': tokenValue
            },
            body: JSON.stringify({
                Context: { argv }
            })
        })
    })
}

/**
 * 执行 WPS Webhook 调用，支持 403/500 错误时的自动重试和分批回退
 *
 * 策略（对客户端完全透明）：
 * 1. 首次请求
 * 2. 403/500 → 延迟后重试一次
 * 3. 仍失败且为 searchBatch → 拆分为每批 10 条，逐批请求（每批最多重试 2 次），合并结果
 * 4. 全部失败 → 返回最后一次的错误信息
 */
async function executeWpsCallWithFallback(
    webhookUrl: string,
    tokenValue: string,
    argv: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
    // 第一次尝试
    let response = await callWpsWebhook(webhookUrl, tokenValue, argv)
    if (response.ok) {
        return { ok: true, status: 200, data: await response.json() }
    }

    if (!RETRYABLE_STATUS.has(response.status)) {
        return { ok: false, status: response.status, error: `WPS API 错误: ${response.status} ${response.statusText}` }
    }

    console.log(`[WPS Fallback] 首次请求失败 (${response.status})，2 秒后重试...`)

    // 重试一次
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000))
    response = await callWpsWebhook(webhookUrl, tokenValue, argv)
    if (response.ok) {
        console.log('[WPS Fallback] 重试成功')
        return { ok: true, status: 200, data: await response.json() }
    }

    if (!RETRYABLE_STATUS.has(response.status)) {
        return { ok: false, status: response.status, error: `WPS API 错误: ${response.status} ${response.statusText}` }
    }

    // 重试仍失败 — 尝试分批回退（仅 searchBatch 且查询数 > 1）
    if (argv.action === 'searchBatch' && Array.isArray(argv.batchCriteria) && (argv.batchCriteria as unknown[]).length > 1) {
        console.log(`[WPS Fallback] 重试仍失败 (${response.status})，启用分批回退策略...`)

        const batchCriteria = argv.batchCriteria as unknown[]
        const chunks: unknown[][] = []
        for (let i = 0; i < batchCriteria.length; i += FALLBACK_CHUNK_SIZE) {
            chunks.push(batchCriteria.slice(i, i + FALLBACK_CHUNK_SIZE))
        }

        console.log(`[WPS Fallback] ${batchCriteria.length} 条查询 → ${chunks.length} 批（每批 ≤${FALLBACK_CHUNK_SIZE} 条）`)

        const allResults: any[] = []
        let totalMatches = 0
        let succeededChunks = 0
        let lastError = `HTTP ${response.status}`

        for (let i = 0; i < chunks.length; i++) {
            const chunkArgv = { ...argv, batchCriteria: chunks[i] }

            // 批次间延迟，降低触发限流的概率
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 500))
            }

            try {
                let chunkOk = false
                // 每批最多尝试 2 次
                for (let attempt = 0; attempt < 2 && !chunkOk; attempt++) {
                    if (attempt > 0) {
                        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000))
                    }

                    const chunkResp = await callWpsWebhook(webhookUrl, tokenValue, chunkArgv)
                    if (chunkResp.ok) {
                        const chunkData = await chunkResp.json()
                        const parsed = parseWpsResponse<any>(chunkData)
                        if (parsed.success && parsed.data) {
                            allResults.push(...(parsed.data.results || []))
                            totalMatches += parsed.data.totalMatches || 0
                            succeededChunks++
                            chunkOk = true
                        } else {
                            lastError = parsed.error || '解析失败'
                        }
                    } else {
                        lastError = `HTTP ${chunkResp.status}`
                    }
                }
            } catch (chunkErr) {
                lastError = chunkErr instanceof Error ? chunkErr.message : '未知错误'
            }
        }

        if (succeededChunks > 0) {
            console.log(`[WPS Fallback] 分批完成: ${succeededChunks}/${chunks.length} 批成功，${allResults.length} 条结果`)
            const mergedResult = {
                success: true,
                sheetName: argv.sheetName,
                totalQueries: batchCriteria.length,
                totalMatches,
                results: allResults
            }
            return { ok: true, status: 200, data: { data: { result: JSON.stringify(mergedResult) } } }
        }

        // 所有批次均失败
        return { ok: false, status: response.status, error: `WPS API 错误: 分批重试全部失败 (${lastError})` }
    }

    // 非 searchBatch 或单条查询，无法分批
    return { ok: false, status: response.status, error: `WPS API 错误: ${response.status} ${response.statusText}` }
}
