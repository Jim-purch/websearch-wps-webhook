'use client'

import { useState, useCallback, useMemo } from 'react'
import { useTokens } from './useTokens'
import { useSharedTokens } from './useSharedTokens'
import {
    getTableList,
    searchMultiCriteria,
    type WpsTable,
    type WpsSearchCriteria,
    type WpsSearchResult,
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

    // 导出状态
    const [isExporting, setIsExporting] = useState(false)

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
            const results = await fetchSearchResults(conditions)

            // 动态导入 ExcelJS 和 file-saver 以避免 SSR 问题和减少初始包大小
            const ExcelJS = (await import('exceljs')).default
            const { saveAs } = (await import('file-saver'))

            const workbook = new ExcelJS.Workbook()
            let hasData = false

            results.forEach(result => {
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

                    // 自动生成列头
                    if (flatRecords.length > 0) {
                        // 获取所有记录的所有唯一键，以防止某些记录缺少字段
                        const allKeys = Array.from(new Set(flatRecords.flatMap(r => Object.keys(r))))

                        worksheet.columns = allKeys.map(key => ({
                            header: key,
                            key: key,
                            width: 20 // 默认宽度
                        }))

                        worksheet.addRows(flatRecords)
                    }
                }
            })

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
    }, [fetchSearchResults])

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
        isExporting
    }
}
