'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTokens } from './useTokens'
import { useSharedTokens } from './useSharedTokens'
import {
    getTableList,
    searchMultiCriteria,
    searchBatch,
    getImageUrls,
    refreshGsheetCache,
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
    clean?: boolean
}

export interface ColumnConfig {
    name: string
    fetch: boolean
    sameValue?: boolean // 是否参与同值批量搜索
}

export interface ModifiedCell {
    resultIndex: number
    tableName: string
    tokenId?: string     // 归属 Token ID
    rowIdx: number       // Index in searchResults[resultIndex].records
    rowNumber: number    // Row number in the worksheet (_rowNumber)
    columnName: string
    originalValue: any
    newValue: any
}

export interface TableSearchResult {
    tableName: string
    realTableName?: string  // 真实表名（用于图片加载等API调用）
    tokenId?: string        // 归属 Token ID
    criteriaDescription: string
    records: Record<string, unknown>[]
    totalCount: number
    truncated: boolean
    originalTotalCount?: number | string
    maxRecords?: number
    error?: string
    originalQueryColumns?: string[]  // 原始查询列名称列表
    displayColumns?: string[] // 显示列顺序（基于用户配置）
    originalCriteria?: WpsSearchCriteria[] // 原始查询条件（用于加载更多）
    isLoadingMore?: boolean // 是否正在加载更多中
}

// 移除硬编码的 BATCH_SIZE，改为通过参数传递，默认50

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
        error: newResult.error || existing.error,
        originalQueryColumns: mergedCols,
        displayColumns: newResult.displayColumns || existing.displayColumns, // 保留显示列配置
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
        const isClean = crit.clean !== false

        let cellValueClean: string
        let searchValueClean: string

        if (isClean) {
            cellValueClean = cleanValue(cellValue)
            searchValueClean = crit.searchValueClean || cleanValue(crit.searchValue)
        } else {
            cellValueClean = cellValue === null || cellValue === undefined ? '' : String(cellValue).trim().toLowerCase()
            searchValueClean = (crit.searchValueClean !== undefined ? crit.searchValueClean : crit.searchValue).trim().toLowerCase()
        }

        if (crit.op === 'Equals') {
            if (cellValueClean !== searchValueClean) return false
        } else {
            // Contains
            if (!cellValueClean.includes(searchValueClean)) return false
        }
    }
    return true
}

export function parseTableKey(tableKey: string) {
    let tokenId = ''
    let tableName = tableKey

    if (tableKey.startsWith('preset::')) {
        const remaining = tableKey.slice(8) // remove 'preset::'
        const index = remaining.indexOf('::')
        if (index !== -1) {
            tokenId = 'preset::' + remaining.slice(0, index)
            tableName = remaining.slice(index + 2)
        } else {
            tokenId = 'preset::' + remaining
            tableName = ''
        }
    } else if (tableKey.includes('::')) {
        const index = tableKey.indexOf('::')
        tokenId = tableKey.slice(0, index)
        tableName = tableKey.slice(index + 2)
    }

    return { tokenId, tableName }
}

export function usePartSearch() {
    const { tokens, isLoading: isLoadingTokens } = useTokens()
    const { isLoading: isLoadingShared, getUsableSharedTokens } = useSharedTokens()

    // 当前选中的 Token 列表
    const [selectedTokens, setSelectedTokens] = useState<Token[]>([])

    // 兼容旧版的单Token，返回列表第一个 Token
    const selectedToken = useMemo(() => selectedTokens[0] || null, [selectedTokens])

    // 表列表和选中状态
    const [tables, setTables] = useState<WpsTable[]>([])
    const [selectedTableNames, setSelectedTableNames] = useState<Set<string>>(new Set()) // tableKey is 'tokenId::tableName'
    const [isLoadingTables, setIsLoadingTables] = useState(false)
    const [tablesError, setTablesError] = useState<string | null>(null)

    // 列数据 {tableKey: columns[]}
    const [columnsData, setColumnsData] = useState<Record<string, WpsColumn[]>>({})
    const [selectedColumns, setSelectedColumns] = useState<Record<string, string[]>>({}) // 用于搜索条件选择
    // 列配置 {tableKey: ColumnConfig[]} - 用于排序和是否获取
    const [columnConfigs, setColumnConfigs] = useState<Record<string, ColumnConfig[]>>({})

    // 搜索结果
    const [searchResults, setSearchResults] = useState<TableSearchResult[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [searchError, setSearchError] = useState<string | null>(null)

    // 已修改的单元格数据 { "resultIndex__rowIdx__columnName": ModifiedCell }
    const [modifiedCells, setModifiedCells] = useState<Record<string, ModifiedCell>>({})

    // 批量搜索状态
    const [isBatchSearching, setIsBatchSearching] = useState(false)
    const [batchProgress, setBatchProgress] = useState<string>('')

    // 导出状态
    const [isExporting, setIsExporting] = useState(false)

    // Google Sheets 缓存控制
    const [refreshTokensCache, setRefreshTokensCache] = useState<Record<string, boolean>>({})

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

    const supabase = useMemo(() => createClient(), [])

    // 预设分享的虚拟 Mock Token 列表
    const [receivedPresetTokens, setReceivedPresetTokens] = useState<Token[]>([])

    // 自动加载接收到的预设分享，生成对应的 Mock Token 并合并到可用列表中
    useEffect(() => {
        const fetchReceivedPresetTokens = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data, error } = await supabase
                .from('preset_shares')
                .select(`
                    id,
                    preset:search_presets(id, name, token_id, user_profiles(email))
                `)
                .eq('shared_with', user.id)
                .eq('is_active', true)

            if (!error && data) {
                const mapped = data.map((share: any) => {
                    const preset = (share as any).preset
                    if (!preset) return null
                    return {
                        id: `preset::${preset.id}`,
                        originalTokenId: preset.token_id, // 保存原始的 Token ID，供匹配使用
                        name: `${preset.name} (预设限制使用)`,
                        token_value: '',
                        webhook_url: 'preset-webhook',
                        is_active: true,
                        description: `来自 ${preset.user_profiles?.email || '未知用户'} 的预设分享`,
                        _isShared: true,
                        _sharerEmail: preset.user_profiles?.email
                    } as any
                }).filter(Boolean) as Token[]
                setReceivedPresetTokens(mapped)
            }
        }

        fetchReceivedPresetTokens()
    }, [supabase])

    // 合并自己的 Token、分享的 Token 以及被分享预设产生的限制 Token
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

        return [...ownTokens, ...sharedUsableTokens, ...receivedPresetTokens]
    }, [tokens, getUsableSharedTokens, receivedPresetTokens])

    // 刷新表列表
    const refreshTables = useCallback(async (customTokens?: Token[]) => {
        const tokensToFetch = customTokens || selectedTokens
        if (tokensToFetch.length === 0) {
            setTables([])
            setSelectedTableNames(new Set())
            setColumnsData({})
            setSelectedColumns({})
            setSearchResults([])
            setTablesError(null)
            return []
        }

        setIsLoadingTables(true)
        setTablesError(null)

        try {
            const promises = tokensToFetch.map(async (token) => {
                if (!token.webhook_url) {
                    return { success: false, tokenId: token.id, tokenName: token.name, error: '没有配置 Webhook URL' }
                }
                const result = await getTableList(token.id)
                return {
                    success: result.success,
                    tokenId: token.id,
                    tokenName: token.name,
                    data: result.data || [],
                    error: result.error
                }
            })

            const results = await Promise.all(promises)
            
            const allTables: WpsTable[] = []
            const errors: string[] = []

            for (const res of results) {
                if (res.success && res.data) {
                    const tokenObj = tokensToFetch.find(t => t.id === res.tokenId)
                    const isGsheet = tokenObj?.webhook_url?.startsWith('gsheet://') || false
                    const tablesWithToken = res.data.map(table => ({
                        ...table,
                        tokenId: res.tokenId,
                        tokenName: res.tokenName,
                        isGoogleSheets: isGsheet,
                        cacheTime: table.cacheTime || null
                    }))
                    allTables.push(...tablesWithToken)
                } else {
                    errors.push(`${res.tokenName}: ${res.error || '加载失败'}`)
                }
            }

            setTables(allTables)
            if (errors.length > 0) {
                setTablesError(errors.join('; '))
            } else {
                setTablesError(null)
            }

            // 过滤已选择表，保留仍然有效的表（以 tokenId::tableName 形式检查）
            setSelectedTableNames(prev => {
                const next = new Set<string>()
                const validTableKeys = new Set(allTables.map(t => `${t.tokenId}::${t.name}`))
                for (const key of prev) {
                    if (validTableKeys.has(key)) {
                        next.add(key)
                    }
                }
                return next
            })

            return allTables
        } catch (err) {
            const msg = err instanceof Error ? err.message : '加载表列表失败'
            setTablesError(msg)
            throw err
        } finally {
            setIsLoadingTables(false)
        }
    }, [selectedTokens])

    // 监听 selectedTokens 变化，并发加载所有 Token 对应的表列表
    useEffect(() => {
        let isMounted = true
        
        refreshTables().catch(err => {
            console.error('Failed to auto-fetch tables:', err)
        })

        return () => {
            isMounted = false
        }
    }, [selectedTokens, refreshTables])

    // 选择 Token (单个选择，用于兼容或特定单选)
    const selectToken = useCallback(async (tokenId: string) => {
        const token = allTokens.find(t => t.id === tokenId)
        if (!token) {
            setSelectedTokens([])
        } else {
            setSelectedTokens([token])
        }
    }, [allTokens])

    // 切换单个 Token 选中状态
    const toggleToken = useCallback((tokenId: string) => {
        setSelectedTokens(prev => {
            const isAlreadySelected = prev.some(t => t.id === tokenId)
            if (isAlreadySelected) {
                return prev.filter(t => t.id !== tokenId)
            } else {
                const token = allTokens.find(t => t.id === tokenId)
                return token ? [...prev, token] : prev
            }
        })
    }, [allTokens])

    // 全选 Token
    const selectAllTokens = useCallback(() => {
        setSelectedTokens(allTokens)
    }, [allTokens])

    // 取消选择所有 Token
    const deselectAllTokens = useCallback(() => {
        setSelectedTokens([])
    }, [])

    // 切换表选择 (tableKey 为 tokenId::tableName)
    const toggleTable = useCallback((tableKey: string) => {
        setSelectedTableNames(prev => {
            const next = new Set(prev)
            if (next.has(tableKey)) {
                next.delete(tableKey)
            } else {
                next.add(tableKey)
            }
            return next
        })
    }, [])

    // 全选/取消全选表
    const selectAllTables = useCallback(() => {
        setSelectedTableNames(new Set(tables.map(t => `${t.tokenId}::${t.name}`)))
    }, [tables])

    const deselectAllTables = useCallback(() => {
        setSelectedTableNames(new Set())
    }, [])

    // 加载选中表的列信息 (支持异步刷新 Google Sheets 缓存)
    const loadColumnsForSelected = useCallback(async () => {
        // 查找哪些选中的表需要刷新缓存
        const tablesToRefresh = Array.from(selectedTableNames).filter(tableKey => {
            const { tokenId } = parseTableKey(tableKey)
            const table = tables.find(t => `${t.tokenId}::${t.name}` === tableKey)
            return table?.isGoogleSheets && refreshTokensCache[tokenId]
        })

        if (tablesToRefresh.length > 0) {
            setIsLoadingTables(true)
            setTablesError(null)
            try {
                const refreshPromises = tablesToRefresh.map(async (tableKey) => {
                    const { tokenId, tableName } = parseTableKey(tableKey)
                    
                    const res = await refreshGsheetCache(tokenId, tableName)
                    if (res.success && res.data) {
                        return { tableKey, cacheTime: res.data.cacheTime }
                    } else {
                        console.error(`刷新表 ${tableName} 缓存失败:`, res.error)
                    }
                    return null
                })

                const refreshResults = await Promise.all(refreshPromises)

                // 更新 tables 状态中的缓存时间
                setTables(prevTables => {
                    return prevTables.map(t => {
                        const key = `${t.tokenId}::${t.name}`
                        const match = refreshResults.find(r => r && r.tableKey === key)
                        if (match) {
                            return { ...t, cacheTime: match.cacheTime }
                        }
                        return t
                    })
                })

                // 重置这些已刷新 Token 的强制刷新状态
                setRefreshTokensCache(prev => {
                    const next = { ...prev }
                    for (const tableKey of tablesToRefresh) {
                        const { tokenId } = parseTableKey(tableKey)
                        next[tokenId] = false
                    }
                    return next
                })

            } catch (err) {
                console.error('Refresh caches failed:', err)
                setTablesError('刷新 Google Sheets 缓存时发生错误')
            } finally {
                setIsLoadingTables(false)
            }
        }

        // 清空之前的搜索结果
        setSearchResults([])

        const newColumnsData: Record<string, WpsColumn[]> = {}
        const newSelectedColumns: Record<string, string[]> = {}

        const nextConfigs = { ...columnConfigs }
        let configsChanged = false

        for (const tableKey of selectedTableNames) {
            const { tokenId, tableName } = parseTableKey(tableKey)

            const table = tables.find(t => t.name === tableName && (!tokenId || t.tokenId === tokenId))
            if (table && table.columns && table.columns.length > 0) {
                newSelectedColumns[tableKey] = [] // 重置已选的搜索列，以清空步骤4

                 // 初始化列配置（如果不存在）
                if (!nextConfigs[tableKey] || nextConfigs[tableKey].length === 0) {
                    nextConfigs[tableKey] = table.columns.map(col => {
                        const colName = typeof col === 'string' ? col : col.name
                        return {
                            name: colName,
                            fetch: true // 默认获取
                        }
                    })
                    configsChanged = true
                } else {
                    // 如果已存在，检查是否有新列需要添加
                    const existingNames = new Set(nextConfigs[tableKey].map(c => c.name))
                    const newCols = table.columns.filter(c => {
                        const colName = typeof c === 'string' ? c : c.name
                        return !existingNames.has(colName)
                    })
                    if (newCols.length > 0) {
                        nextConfigs[tableKey] = [
                            ...nextConfigs[tableKey],
                            ...newCols.map(c => {
                                const colName = typeof c === 'string' ? c : c.name
                                return { name: colName, fetch: true }
                            })
                        ]
                        configsChanged = true
                    }
                }

                // 根据 nextConfigs[tableKey] 的顺序对 columns 进行排序并存入 newColumnsData
                const colMap = new Map(table.columns.map(c => {
                    const colName = typeof c === 'string' ? c : c.name
                    const colObj = typeof c === 'string' ? { name: c, type: 'string' } : c
                    return [colName, colObj]
                }))
                newColumnsData[tableKey] = nextConfigs[tableKey]
                    .map(cfg => colMap.get(cfg.name))
                    .filter((c): c is WpsColumn => !!c)
            }
        }

        if (configsChanged) {
            setColumnConfigs(nextConfigs)
        }
        setColumnsData(newColumnsData)
        setSelectedColumns(newSelectedColumns)
    }, [selectedTableNames, tables, refreshTokensCache, columnConfigs])

    // 切换列选择 (tableName 为 tableKey)
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

    // 全选获取/全不获取
    const fetchAllColumns = useCallback(() => {
        setColumnConfigs(prev => {
            const newConfigs: Record<string, ColumnConfig[]> = {}
            for (const [tableKey, configs] of Object.entries(prev)) {
                newConfigs[tableKey] = configs.map(c => ({ ...c, fetch: true }))
            }
            return newConfigs
        })
    }, [])

    const unfetchAllColumns = useCallback(() => {
        setColumnConfigs(prev => {
            const newConfigs: Record<string, ColumnConfig[]> = {}
            for (const [tableKey, configs] of Object.entries(prev)) {
                newConfigs[tableKey] = configs.map(c => ({ ...c, fetch: false }))
            }
            return newConfigs
        })
    }, [])

    // 复制表（用于同一表的不同列搜索，tableName 为 tableKey）
    const duplicateTable = useCallback((tableKey: string) => {
        const realTableName = tableKey.includes('__copy_') ? tableKey.split('__copy_')[0] : tableKey
        const columns = columnsData[tableKey]
        if (!columns) return

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
        setColumnConfigs(prev => ({
            ...prev,
            [newKey]: prev[tableKey] ? [...prev[tableKey]] : columns.map(c => ({ name: c.name, fetch: true }))
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

    // 执行搜索 (支持独立字段条件以及 unified 同值批量搜索)
    const performSearch = useCallback(async (
        conditions: SearchCondition[],
        sameValueParams?: {
            values: string[]
            op: 'Contains' | 'Equals'
            limit?: number
            clean?: boolean
        }
    ) => {
        setIsSearching(true)
        setSearchError(null)
        setSearchResults([])

        try {
            // 按表分组独立条件
            const conditionsByTableKey: Record<string, SearchCondition[]> = {}
            for (const cond of conditions) {
                if (!conditionsByTableKey[cond.tableName]) {
                    conditionsByTableKey[cond.tableName] = []
                }
                conditionsByTableKey[cond.tableName].push(cond)
            }

            const sameValueValues = sameValueParams?.values.filter(v => v.trim() !== '') || []
            const sameValueOp = sameValueParams?.op || 'Contains'

            // 查找所有开启且选中的同值搜索字段的表
            const tablesWithSameValue: string[] = []
            if (sameValueValues.length > 0) {
                for (const [tableKey, cols] of Object.entries(selectedColumns)) {
                    const configs = columnConfigs[tableKey] || []
                    const hasSameValue = cols.some(colName => {
                        const config = configs.find(c => c.name === colName)
                        return config && config.sameValue
                    })
                    if (hasSameValue) {
                        tablesWithSameValue.push(tableKey)
                    }
                }
            }

            const allSearchTableKeys = Array.from(new Set([
                ...Object.keys(conditionsByTableKey),
                ...tablesWithSameValue
            ]))

            if (allSearchTableKeys.length === 0) {
                throw new Error('请填写搜索关键词或配置同值批量搜索内容')
            }

            const results: TableSearchResult[] = []

            for (const tableKey of allSearchTableKeys) {
                const tableKeyWithoutCopy = tableKey.includes('__copy_')
                    ? tableKey.split('__copy_')[0]
                    : tableKey
                
                const { tokenId, tableName: realTableName } = parseTableKey(tableKeyWithoutCopy)
                const tokenName = selectedTokens.find(t => t.id === tokenId)?.name || ''

                const displayTableName = tableKey.includes('__copy_')
                    ? `${realTableName} (副本${tableKey.split('__copy_')[1]})`
                    : realTableName

                const displayTableNameWithToken = selectedTokens.length > 1 
                    ? `[${tokenName}] ${displayTableName}`
                    : displayTableName

                const currentConfig = columnConfigs[tableKey] || []
                const returnColumns = currentConfig.filter(c => c.fetch).map(c => c.name)
                const displayColumns = returnColumns

                // 独立条件过滤
                const tableIndependentConds = (conditionsByTableKey[tableKey] || []).map(c => {
                    const clean = c.clean ?? true
                    return {
                        columnName: c.columnName,
                        searchValue: clean ? cleanValue(c.searchValue) : c.searchValue.trim(),
                        searchValueClean: clean ? cleanValue(c.searchValue) : c.searchValue.trim(),
                        op: c.op,
                        clean
                    } as WpsSearchCriteria
                })

                const isSameValueSearchForTable = tablesWithSameValue.includes(tableKey)

                if (isSameValueSearchForTable) {
                    // 同值检索字段
                    const tableSameValueCols = currentConfig
                        .filter(c => c.sameValue && selectedColumns[tableKey]?.includes(c.name))
                        .map(c => c.name)

                    if (tableSameValueCols.length === 0) continue

                    const cleanedSameValueValues: string[] = []
                    const batchItems: Array<{ id: string; criteria: WpsSearchCriteria[] }> = []
                    const cleanSameValue = sameValueParams?.clean ?? true
                    for (const val of sameValueValues) {
                        const cleanedVal = cleanSameValue ? cleanValue(val) : val.trim()
                        if (!cleanedVal) continue
                        
                        if (!cleanedSameValueValues.includes(cleanedVal)) {
                            cleanedSameValueValues.push(cleanedVal)
                        }
                        
                        for (const col of tableSameValueCols) {
                            batchItems.push({
                                id: `${cleanedVal}::${col}`,
                                criteria: [
                                    {
                                        columnName: col,
                                        searchValue: cleanedVal,
                                        searchValueClean: cleanedVal,
                                        op: sameValueOp,
                                        clean: cleanSameValue
                                    },
                                    ...tableIndependentConds
                                ]
                            })
                        }
                    }

                    if (batchItems.length === 0) continue

                    try {
                        const res = await searchBatch(
                            tokenId,
                            realTableName,
                            batchItems,
                            returnColumns.length > 0 ? returnColumns : undefined,
                            sameValueParams?.limit,
                            undefined,
                            true,
                            tableSameValueCols,
                            cleanedSameValueValues
                        )
                        if (res.success && res.data) {
                            const batchRes = res.data as WpsBatchSearchResult
                            const allRecords: Record<string, unknown>[] = []
                            const recordKeySet = new Set<string>()

                            for (const itemResult of batchRes.results) {
                                if (itemResult.success && itemResult.records) {
                                    const [val] = itemResult.id.split('::')
                                    const item = batchItems.find(bi => bi.id === itemResult.id)
                                    const itemCriteria = item?.criteria || []

                                    const filteredRecords = itemResult.records.filter(record =>
                                        matchesAllCriteria(record as Record<string, unknown>, itemCriteria)
                                    )

                                    for (const rec of filteredRecords) {
                                        const rowNum = (rec._rowNumber || rec.row) as number || Math.random()
                                        const recKey = `${rowNum}`

                                        if (!recordKeySet.has(recKey)) {
                                            recordKeySet.add(recKey)
                                            allRecords.push({
                                                ...rec,
                                                _BatchQueryID: val
                                            })
                                        } else {
                                            const existingRec = allRecords.find(r => `${(r._rowNumber || r.row)}` === recKey)
                                            if (existingRec && existingRec._BatchQueryID !== val) {
                                                existingRec._BatchQueryID = `${existingRec._BatchQueryID}, ${val}`
                                            }
                                        }
                                    }
                                }
                            }

                            results.push({
                                tableName: displayTableNameWithToken,
                                realTableName: realTableName,
                                tokenId: tokenId,
                                criteriaDescription: `同值批量搜索 (${tableSameValueCols.join('/')})，共匹配 ${allRecords.length} 条记录`,
                                records: allRecords,
                                totalCount: allRecords.length,
                                truncated: false,
                                displayColumns: displayColumns,
                                originalQueryColumns: []
                            })
                        } else {
                            results.push({
                                tableName: displayTableNameWithToken,
                                realTableName: realTableName,
                                tokenId: tokenId,
                                criteriaDescription: `同值批量搜索失败`,
                                records: [],
                                totalCount: 0,
                                truncated: false,
                                error: res.error || '批量搜索接口返回失败'
                            })
                        }
                    } catch (err) {
                        results.push({
                            tableName: displayTableNameWithToken,
                            realTableName: realTableName,
                            tokenId: tokenId,
                            criteriaDescription: `同值批量搜索异常`,
                            records: [],
                            totalCount: 0,
                            truncated: false,
                            error: err instanceof Error ? err.message : '搜索失败'
                        })
                    }
                } else {
                    const criteriaDesc = tableIndependentConds
                        .map(c => `${c.columnName} ${c.op === 'Contains' ? '包含' : '等于'} "${c.searchValue}"`)
                        .join(' AND ')

                    try {
                        const result = await searchMultiCriteria(
                            tokenId,
                            realTableName,
                            tableIndependentConds,
                            returnColumns.length > 0 ? returnColumns : undefined,
                            undefined, // limit
                            undefined, // offset
                            undefined
                        )

                        if (result.success && result.data) {
                            const data = result.data as WpsSearchResult
                            let records = data.records || []

                            records = records.filter(record => matchesAllCriteria(record, tableIndependentConds))

                            results.push({
                                tableName: displayTableNameWithToken,
                                realTableName: realTableName,
                                tokenId: tokenId,
                                criteriaDescription: criteriaDesc,
                                records: records,
                                totalCount: records.length,
                                truncated: data.truncated || false,
                                originalTotalCount: data.originalTotalCount,
                                maxRecords: data.maxRecords,
                                displayColumns: displayColumns,
                                originalCriteria: tableIndependentConds
                            })
                        } else {
                            results.push({
                                tableName: displayTableNameWithToken,
                                realTableName: realTableName,
                                tokenId: tokenId,
                                criteriaDescription: criteriaDesc,
                                records: [],
                                totalCount: 0,
                                truncated: false,
                                error: result.error || '搜索失败'
                            })
                        }
                    } catch (err) {
                        results.push({
                            tableName: displayTableNameWithToken,
                            realTableName: realTableName,
                            tokenId: tokenId,
                            criteriaDescription: criteriaDesc,
                            records: [],
                            totalCount: 0,
                            truncated: false,
                            error: err instanceof Error ? err.message : '搜索失败'
                        })
                    }
                }
            }

            setSearchResults(results)
        } catch (err) {
            setSearchError(err instanceof Error ? err.message : '搜索发生错误')
        } finally {
            setIsSearching(false)
        }
    }, [selectedTokens, columnConfigs, selectedColumns])

    // 加载更多 WPS 搜索数据
    const loadMore = useCallback(async (resultIndex: number) => {
        const targetResult = searchResults[resultIndex]
        if (!targetResult || targetResult.isLoadingMore) return

        // 设置该表的加载状态
        setSearchResults(prev => {
            const next = [...prev]
            next[resultIndex] = { ...next[resultIndex], isLoadingMore: true }
            return next
        })

        try {
            const limit = 100
            const offset = targetResult.records.length
            
            const result = await searchMultiCriteria(
                targetResult.tokenId || '',
                targetResult.realTableName || '',
                targetResult.originalCriteria || [],
                targetResult.displayColumns,
                limit,
                offset,
                undefined
            )

            if (result.success && result.data) {
                const data = result.data as WpsSearchResult
                let newRecords = data.records || []

                // 客户端二次匹配验证，确保精确度
                if (targetResult.originalCriteria) {
                    newRecords = newRecords.filter(record => matchesAllCriteria(record, targetResult.originalCriteria!))
                }

                setSearchResults(prev => {
                    const next = [...prev]
                    const currentResult = next[resultIndex]
                    next[resultIndex] = {
                        ...currentResult,
                        records: [...currentResult.records, ...newRecords],
                        totalCount: currentResult.totalCount + newRecords.length,
                        truncated: data.truncated || false,
                        originalTotalCount: data.originalTotalCount,
                        maxRecords: data.maxRecords,
                        isLoadingMore: false
                    }
                    return next
                })
            } else {
                setSearchResults(prev => {
                    const next = [...prev]
                    next[resultIndex] = {
                        ...next[resultIndex],
                        isLoadingMore: false,
                        error: result.error || '加载更多失败'
                    }
                    return next
                })
            }
        } catch (err) {
            setSearchResults(prev => {
                const next = [...prev]
                next[resultIndex] = {
                    ...next[resultIndex],
                    isLoadingMore: false,
                    error: err instanceof Error ? err.message : '加载更多发生错误'
                }
                return next
            })
        }
    }, [searchResults])

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
                const resultTokenId = result.tokenId || selectedToken?.id
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
                    const sheetName = result.tableName.replace(/[\\/?*[\]]/g, '_').substring(0, 31)
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
                        const fetchedImageUrls: Record<string, string | null> = {}

                        // 2. 只有未缓存的图片才去获取URL
                        // 注意：如果缓存中的图片URL已经失效（会导致导出时下载失败），我们在后续的 processImage 中会进行重试
                        if (dispImgCellAddressesToFetch.length > 0 && resultTokenId) {
                            console.log(`导出: 获取 ${dispImgCellAddressesToFetch.length} 个未缓存的DISPIMG图片URL...`)
                            try {
                                const imgResult = await getImageUrls(resultTokenId, result.realTableName || result.tableName, dispImgCellAddressesToFetch)
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

                        // 合并缓存的图片，用于填充 table
                        if (dispImgCellAddressesCached.length > 0) {
                            // 即使缓存中有，也添加到fetchedImageUrls以便查找，但要在后面标记来源
                            for (const address of dispImgCellAddressesCached) {
                                const cacheKey = `${result.realTableName || result.tableName}__${address}`
                                fetchedImageUrls[address] = imageUrlCache[cacheKey]
                            }
                        }

                        worksheet.columns = allKeys.map(key => ({
                            header: key,
                            key: key,
                            width: imageColumns.has(key) ? 15 : 20 // 图片列稍窄
                        }))

                        // 添加数据行，但先处理非图片数据
                        const imagePositions: Array<{
                            row: number;
                            col: number;
                            url: string;
                            cellAddress?: string // 用于失败重试
                        }> = []

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
                                        url: fetchedImageUrls[imgInfo.cellAddress]!,
                                        cellAddress: imgInfo.cellAddress
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
                        const processImage = async (pos: { row: number; col: number; url: string; cellAddress?: string }) => {
                            console.log(`[导出] 处理图片位置: 行${pos.row}, 列${pos.col}, URL: ${pos.url.substring(0, 40)}...`)

                            let imgData = await fetchImageAsBase64(pos.url)

                            // 如果下载失败且有 cellAddress (说明是 WPS 图片)，尝试刷新 URL 重试
                            if (!imgData && pos.cellAddress && resultTokenId) {
                                console.log(`[导出] 图片下载失败，尝试刷新 URL 重试: ${pos.cellAddress}`)
                                try {
                                    const retryResult = await getImageUrls(resultTokenId, result.realTableName || result.tableName, [pos.cellAddress])
                                    if (retryResult.success && retryResult.data?.imageUrls?.[pos.cellAddress]) {
                                        const newUrl = retryResult.data.imageUrls[pos.cellAddress]

                                        if (newUrl) {
                                            console.log(`[导出] URL 刷新成功，重试下载...`)

                                            // 更新缓存，修复UI
                                            handleImageLoad(result.realTableName || result.tableName, pos.cellAddress, newUrl)

                                            // 重试下载
                                            imgData = await fetchImageAsBase64(newUrl)
                                        }
                                    }
                                } catch (retryErr) {
                                    console.error(`[导出] URL 刷新/重试失败`, retryErr)
                                }
                            }

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
    }, [searchResults, selectedTokens, imageUrlCache, handleImageLoad])

    // 导出单个结果到 Excel
    const exportSingleResult = useCallback(async (result: TableSearchResult, selectedRowIndices?: number[]) => {
        const resultTokenId = result.tokenId || selectedToken?.id
        if (!result.records || result.records.length === 0) {
            setSearchError('没有可导出的数据')
            return
        }

        try {
            const ExcelJS = (await import('exceljs')).default
            const { saveAs } = (await import('file-saver'))

            const workbook = new ExcelJS.Workbook()

            // 过滤选中行
            const recordsToExport = selectedRowIndices && selectedRowIndices.length > 0
                ? result.records.filter((_, idx) => selectedRowIndices.includes(idx))
                : result.records

            // 处理数据，展平字段
            const flatRecords = recordsToExport.map(r => {
                if (r.fields && typeof r.fields === 'object') {
                    return r.fields as Record<string, unknown>
                }
                return r
            })

            // Sheet 名称处理
            const sheetName = result.tableName.replace(/[\\/?*[\]]/g, '_').substring(0, 31)

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
            const fetchedImageUrls: Record<string, string | null> = {}

            if (dispImgCellAddressesCached.length > 0) {
                for (const address of dispImgCellAddressesCached) {
                    const cacheKey = `${result.realTableName || result.tableName}__${address}`
                    fetchedImageUrls[address] = imageUrlCache[cacheKey]
                }
            }

            if (dispImgCellAddressesToFetch.length > 0 && resultTokenId) {
                try {
                    const imgResult = await getImageUrls(resultTokenId, result.realTableName || result.tableName, dispImgCellAddressesToFetch)
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
    }, [selectedTokens, imageUrlCache, handleImageLoad])

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
    const performBatchSearch = useCallback(async (
        file: File,
        matchMode: 'fuzzy' | 'exact' = 'exact',
        batchSize: number = 50,
        batchLimit: number = 30
    ) => {
        if (selectedTokens.length === 0) {
            setSearchError('请先选择 Token')
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

                        const cleanVal = val.replace(/[\r\n]+/g, '').trim()
                        if (cleanVal === '') return

                        originalValues[fieldName] = cleanVal

                        // WPS 表格内的数据已经是清理过的格式，直接用清理后的值进行 Find 查找
                        const searchValueCleaned = cleanValue(cleanVal)

                        if (searchValueCleaned) {
                            criteria.push({
                                columnName: fieldName,
                                // 直接使用清理后的值进行搜索
                                searchValue: searchValueCleaned,
                                searchValueClean: searchValueCleaned,
                                op: matchMode === 'exact' ? 'Equals' : 'Contains'
                            } as WpsSearchCriteria)
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

                // 解析 tableKey 对应的 tokenId 和 realTableName
                const tableKeyWithoutCopy = tableKey.includes('__copy_') ? tableKey.split('__copy_')[0] : tableKey
                const { tokenId, tableName: tableRealName } = parseTableKey(tableKeyWithoutCopy)

                const displayTableName = tableKey.includes('__copy_')
                    ? `${realTableName} (副本${tableKey.split('__copy_')[1]})`
                    : realTableName

                // 将 items 分批
                const chunkedItems = []
                for (let j = 0; j < items.length; j += batchSize) {
                    chunkedItems.push(items.slice(j, j + batchSize))
                }

                for (let chunkIdx = 0; chunkIdx < chunkedItems.length; chunkIdx++) {
                    const chunk = chunkedItems[chunkIdx]
                    const currentBatchSize = chunk.length

                    // 更新进度
                    setBatchProgress(`查询中(${processedItemsCount + currentBatchSize}/${totalItemsCount})`)

                    try {
                        const originalQueryColumns = Array.from(new Set(chunk.flatMap(item => Object.keys(item.originalValues).map(k => `原始_${k}`))))

                        // 获取列配置
                        const currentConfig = columnConfigs[tableKey] || []
                        // 筛选出需要获取的列 (fetch === true)
                        const returnColumns = currentConfig.filter(c => c.fetch).map(c => c.name)
                        // 显示列顺序
                        const displayColumns = returnColumns

                        const res = await searchBatch(tokenId, tableRealName, chunk, returnColumns.length > 0 ? returnColumns : undefined, batchLimit, undefined)

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

                                    // 由于 AirScript 端优化后只做模糊匹配，
                                    // 需要在客户端对所有表格类型的结果进行二次过滤
                                    const filteredRecords = itemResult.records.filter(record =>
                                        matchesAllCriteria(record as Record<string, unknown>, itemCriteria)
                                    )

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
                                realTableName: tableRealName,
                                tokenId: tokenId,
                                criteriaDescription: `批量查询`, // 会在 merge 中更新
                                records: allRecords,
                                totalCount: allRecords.length,
                                truncated: false,
                                error: undefined,
                                originalQueryColumns,
                                displayColumns: displayColumns
                            }
                        } else {
                            newResult = {
                                tableName: displayTableName,
                                realTableName: tableRealName,
                                tokenId: tokenId,
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
    }, [selectedTokens, selectedColumns, columnConfigs])

    // 执行粘贴查询 (从粘贴的数据进行批量搜索)
    const performPasteSearch = useCallback(async (
        tableKey: string,
        data: Array<{ id: string; values: Record<string, string> }>,
        matchMode: 'fuzzy' | 'exact' = 'exact',
        batchSize: number = 50,
        batchLimit: number = 30
    ) => {
        if (selectedTokens.length === 0) {
            setSearchError('请先选择 Token')
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
            const tableKeyWithoutCopy = tableKey.includes('__copy_')
                ? tableKey.split('__copy_')[0]
                : tableKey

            const { tokenId, tableName: realTableName } = parseTableKey(tableKeyWithoutCopy)

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
                    // WPS 表格内的数据已经是清理过的格式，直接用清理后的值进行 Find 查找
                    const searchValueCleaned = cleanValue(value)

                    if (searchValueCleaned) {
                        criteria.push({
                            columnName,
                            // 直接使用清理后的值进行搜索
                            searchValue: searchValueCleaned,
                            searchValueClean: searchValueCleaned,
                            op: matchMode === 'exact' ? 'Equals' : 'Contains'
                        } as WpsSearchCriteria)
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
            for (let i = 0; i < allItems.length; i += batchSize) {
                chunkedItems.push(allItems.slice(i, i + batchSize))
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

                // 获取列配置
                const currentConfig = columnConfigs[tableKey] || []
                // 筛选出需要获取的列 (fetch === true)
                const returnColumns = currentConfig.filter(c => c.fetch).map(c => c.name)
                // 显示列顺序
                const displayColumns = returnColumns

                const res = await searchBatch(tokenId, realTableName, chunk, returnColumns.length > 0 ? returnColumns : undefined, batchLimit, undefined)

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

                            // 由于 AirScript 端优化后只做模糊匹配，
                            // 需要在客户端对所有表格类型的结果进行二次过滤
                            const filteredRecords = itemResult.records.filter(record =>
                                matchesAllCriteria(record as Record<string, unknown>, itemCriteria)
                            )

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
                        tokenId: tokenId,
                        criteriaDescription: `粘贴查询`, // 会在 merge 中更新
                        records: allRecords,
                        totalCount: allRecords.length,
                        truncated: false,
                        error: undefined,
                        originalQueryColumns,
                        displayColumns: displayColumns
                    }
                } else {
                    newResult = {
                        tableName: displayTableName,
                        realTableName: realTableName,
                        tokenId: tokenId,
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
    }, [selectedTokens, columnConfigs])

    // 更新单元格本地状态
    const updateCell = useCallback((resultIndex: number, rowIdx: number, columnName: string, newValue: any) => {
        setSearchResults(prevResults => {
            const nextResults = [...prevResults]
            const result = { ...nextResults[resultIndex] }
            const records = [...result.records]
            const record = { ...records[rowIdx] }
            
            const originalVal = record[columnName]
            record[columnName] = newValue
            records[rowIdx] = record
            result.records = records
            nextResults[resultIndex] = result

            // 更新已修改单元格的状态
            setModifiedCells(prev => {
                const key = `${resultIndex}__${rowIdx}__${columnName}`
                const rowNumber = (record._rowNumber || record.row) as number
                const existing = prev[key]
                
                // 如果该单元格之前已经被修改过，保留最初的原始值
                const originalValue = existing ? existing.originalValue : originalVal
                
                const next = { ...prev }
                if (newValue === originalValue) {
                    delete next[key]
                } else {
                    next[key] = {
                        resultIndex,
                        tableName: result.realTableName || result.tableName,
                        tokenId: result.tokenId,
                        rowIdx,
                        rowNumber,
                        columnName,
                        originalValue,
                        newValue
                    }
                }
                return next
            })

            return nextResults
        })
    }, [])

    // 撤销所有修改
    const revertChanges = useCallback(() => {
        setSearchResults(prevResults => {
            const nextResults = [...prevResults]
            const modifications = Object.values(modifiedCells)
            if (modifications.length === 0) return prevResults

            const affectedResultIndices = new Set(modifications.map(m => m.resultIndex))
            for (const resIdx of affectedResultIndices) {
                const result = { ...nextResults[resIdx] }
                result.records = [...result.records]
                nextResults[resIdx] = result
            }

            for (const mod of modifications) {
                const result = nextResults[mod.resultIndex]
                const record = { ...result.records[mod.rowIdx] }
                record[mod.columnName] = mod.originalValue
                result.records[mod.rowIdx] = record
            }

            return nextResults
        })
        setModifiedCells({})
    }, [modifiedCells])

    // 保存修改到云端
    const saveChanges = useCallback(async () => {
        if (!selectedToken) {
            throw new Error('请先选择 Token')
        }

        const modifications = Object.values(modifiedCells)
        if (modifications.length === 0) {
            return
        }

        setIsSearching(true)
        setSearchError(null)

        try {
            // 按 tokenId, 表名和行号分组修改数据，以减少 API 调用次数（一行只调用一次 updateRow）
            const groups: Record<string, Record<string, Record<number, Record<string, any>>>> = {}
            const oldGroups: Record<string, Record<string, Record<number, Record<string, any>>>> = {} // 记录修改前的数据以用于操作历史日志
            
            for (const mod of modifications) {
                if (!mod.rowNumber) {
                    throw new Error(`表格 "${mod.tableName}" 第 ${mod.rowIdx + 1} 行没有行号信息，无法保存到云端`)
                }
                const tokenId = mod.tokenId || selectedToken?.id
                if (!tokenId) {
                    throw new Error(`修改的数据 "${mod.tableName}" 缺少归属 Token 信息`)
                }

                if (!groups[tokenId]) {
                    groups[tokenId] = {}
                    oldGroups[tokenId] = {}
                }
                if (!groups[tokenId][mod.tableName]) {
                    groups[tokenId][mod.tableName] = {}
                    oldGroups[tokenId][mod.tableName] = {}
                }
                if (!groups[tokenId][mod.tableName][mod.rowNumber]) {
                    groups[tokenId][mod.tableName][mod.rowNumber] = {}
                    oldGroups[tokenId][mod.tableName][mod.rowNumber] = {}
                }
                groups[tokenId][mod.tableName][mod.rowNumber][mod.columnName] = mod.newValue
                oldGroups[tokenId][mod.tableName][mod.rowNumber][mod.columnName] = mod.originalValue
            }

            // 导入 wps 客户端的 updateRow 方法
            const { updateRow: clientUpdateRow } = await import('@/lib/wps')

            const promises = []
            for (const [tokenId, tables] of Object.entries(groups)) {
                for (const [tableName, rows] of Object.entries(tables)) {
                    for (const [rowNumberStr, rowData] of Object.entries(rows)) {
                        const rowNumber = parseInt(rowNumberStr, 10)
                        const oldRowData = oldGroups[tokenId][tableName][rowNumber]
                        promises.push(
                            clientUpdateRow(tokenId, tableName, rowNumber, rowData, oldRowData)
                        )
                    }
                }
            }

            const results = await Promise.all(promises)
            
            const failures = results.filter(r => !r.success)
            if (failures.length > 0) {
                const errorMsgs = failures.map(f => f.error).join('; ')
                throw new Error(`部分单元格数据保存到云端失败: ${errorMsgs}`)
            }

            // 全部保存成功，清空本地已修改状态
            setModifiedCells({})
        } catch (err) {
            const msg = err instanceof Error ? err.message : '保存失败'
            setSearchError(msg)
            throw err
        } finally {
            setIsSearching(false)
        }
    }, [selectedTokens, modifiedCells])

    // 批量删除行
    const deleteRows = useCallback(async (resultIndex: number, rowIndices: number[]) => {
        if (selectedTokens.length === 0) {
            throw new Error('请先选择 Token')
        }

        // 校验是否有未保存修改
        const hasUnsavedChanges = Object.values(modifiedCells).some(
            m => m.resultIndex === resultIndex
        )
        if (hasUnsavedChanges) {
            throw new Error('当前表格有未保存的本地修改，请先保存或撤销修改再进行删除操作')
        }

        const result = searchResults[resultIndex]
        if (!result) {
            throw new Error('未找到对应的搜索结果')
        }

        const sheetName = result.realTableName || result.tableName

        // 收集待删除行的绝对行号
        const rowNumbers: number[] = []
        const oldRowsData: Record<string, any>[] = []
        for (const idx of rowIndices) {
            const record = result.records[idx]
            if (record) {
                const rowNum = (record._rowNumber || record.row) as number
                if (!rowNum) {
                    throw new Error(`第 ${idx + 1} 行没有行号信息，无法删除`)
                }
                rowNumbers.push(rowNum)
                oldRowsData.push(record)
            }
        }

        if (rowNumbers.length === 0) return

        setIsSearching(true)
        setSearchError(null)

        try {
            const { deleteRows: clientDeleteRows } = await import('@/lib/wps')
            const apiResult = await clientDeleteRows(result.tokenId || selectedToken?.id || '', sheetName, rowNumbers, oldRowsData)

            if (!apiResult.success) {
                throw new Error(apiResult.error || '删除行失败')
            }

            // 更新前端状态，并调整后续行的行号以维持正确索引
            setSearchResults(prevResults => {
                const nextResults = [...prevResults]
                const curResult = { ...nextResults[resultIndex] }

                // 过滤已删除记录
                const remainingRecords = curResult.records.filter((_, idx) => !rowIndices.includes(idx))

                // 对剩余记录重新计算绝对行号
                curResult.records = remainingRecords.map(record => {
                    const nextRecord = { ...record }
                    const oldRow = (nextRecord._rowNumber || nextRecord.row) as number
                    if (oldRow) {
                        const shift = rowNumbers.filter(deletedNum => deletedNum < oldRow).length
                        const newRow = oldRow - shift
                        if ('_rowNumber' in nextRecord) nextRecord._rowNumber = newRow
                        if ('row' in nextRecord) nextRecord.row = newRow
                    }
                    return nextRecord
                })

                curResult.totalCount = curResult.records.length
                nextResults[resultIndex] = curResult
                return nextResults
            })
        } catch (err) {
            const msg = err instanceof Error ? err.message : '删除失败'
            setSearchError(msg)
            throw err
        } finally {
            setIsSearching(false)
        }
    }, [selectedTokens, searchResults, modifiedCells])

    return {
        // Token
        tokens: allTokens,
        isLoadingTokens: isLoadingTokens || isLoadingShared,
        selectedToken,
        selectedTokens,
        setSelectedTokens,
        selectToken,
        toggleToken,
        selectAllTokens,
        deselectAllTokens,

        // Tables
        tables,
        isLoadingTables,
        tablesError,
        selectedTableNames,
        toggleTable,
        selectAllTables,
        deselectAllTables,
        loadColumnsForSelected,
        refreshTables,

        // Columns
        columnsData,
        selectedColumns,
        toggleColumn,
        selectAllColumns,
        deselectAllColumns,
        fetchAllColumns,
        unfetchAllColumns,
        duplicateTable,
        removeTableCopy,

        // Search
        searchResults,
        isSearching,
        searchError,
        performSearch,
        loadMore,
        exportToExcel,
        exportSingleResult,
        isExporting,
        handleImageLoad,
        imageUrlCache,
        refreshTokensCache,
        setRefreshTokensCache,

        // Batch Search
        isBatchSearching,
        batchProgress,
        downloadBatchTemplate,
        performBatchSearch,
        performPasteSearch,

        // 列配置
        columnConfigs,
        setColumnConfigs,

        // 预设加载支持
        setSelectedTableNames,
        setColumnsData,
        setSelectedColumns,

        // 编辑功能支持
        modifiedCells,
        updateCell,
        revertChanges,
        saveChanges,
        deleteRows
    }
}
