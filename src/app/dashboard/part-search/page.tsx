'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePartSearch, parseTableKey } from '@/hooks/usePartSearch'
import { useSearchPresets } from '@/hooks/useSearchPresets'
import { useAuth } from '@/hooks/useAuth'
import {
    TokenSelector,
    TableSelector,
    ColumnSelector,
    SearchForm,
    ResultTable,
    SavePresetModal,
    PresetBar
} from '@/components/part-search'
import type { SearchPreset } from '@/types'
import type { WpsColumn } from '@/lib/wps'

export default function PartSearchPage() {
    const { user: currentUser } = useAuth()
    const {
        tokens,
        isLoadingTokens,
        selectedToken,
        selectedTokens,
        setSelectedTokens,
        selectToken,
        toggleToken,
        selectAllTokens,
        deselectAllTokens,
        tables,
        isLoadingTables,
        tablesError,
        selectedTableNames,
        toggleTable,
        selectAllTables,
        deselectAllTables,
        loadColumnsForSelected,
        columnsData,
        selectedColumns,
        toggleColumn,
        selectAllColumns,
        deselectAllColumns,
        fetchAllColumns,
        unfetchAllColumns,
        duplicateTable,
        removeTableCopy,
        searchResults,
        isSearching,
        searchError,
        searchingTables,
        performSearch,
        loadMore,
        exportToExcel,
        exportSingleResult,
        isExporting,
        handleImageLoad,
        imageUrlCache,
        isBatchSearching,
        batchProgress,
        downloadBatchTemplate,
        performBatchSearch,
        performPasteSearch,
        refreshTokensCache,
        setRefreshTokensCache,
        columnConfigs,
        setColumnConfigs,
        // 预设加载支持
        setSelectedTableNames,
        setColumnsData,
        setSelectedColumns,
        refreshTables,
        // 编辑功能支持
        modifiedCells,
        updateCell,
        revertChanges,
        saveChanges,
        deleteRows
    } = usePartSearch()

    const {
        presets,
        isLoading: isLoadingPresets,
        fetchPresets,
        createPreset,
        updatePreset,
        deletePreset,
        clearPresets
    } = useSearchPresets()

    // 自动加载图片选项
    const [autoLoadImages, setAutoLoadImages] = useState(false)

    // 预设相关状态
    const [activePresetId, setActivePresetId] = useState<string | null>(null)
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
    const [editingPreset, setEditingPreset] = useState<SearchPreset | null>(null)

    // 包装回调函数以清除当前预设的激活状态
    const withResetPreset = useCallback(<T extends (...args: any[]) => any>(fn: T): T => {
        return ((...args: any[]) => {
            setActivePresetId(null)
            return fn(...args)
        }) as T
    }, [])
    const [forceCollapsedCounter, setForceCollapsedCounter] = useState(0)
    const [forceExpandedCounter, setForceExpandedCounter] = useState(0) // 步骤2展开
    const [step3ExpandedCounter, setStep3ExpandedCounter] = useState(0) // 步骤3展开
    const [step4ExpandedCounter, setStep4ExpandedCounter] = useState(0) // 步骤4展开

    // 始终加载所有预设
    useEffect(() => {
        fetchPresets()
    }, [fetchPresets])

    // 当加载列信息后，自动展开步骤3
    useEffect(() => {
        if (Object.keys(columnsData).length > 0) {
            setStep3ExpandedCounter(prev => prev + 1)
        }
    }, [columnsData])

    // 当选择搜索列后，自动展开步骤4
    useEffect(() => {
        const hasColumns = Object.values(selectedColumns).some(cols => cols.length > 0)
        if (hasColumns) {
            setStep4ExpandedCounter(prev => prev + 1)
        }
    }, [selectedColumns])

    // 检查是否已选择列
    const hasSelectedColumns = Object.values(selectedColumns).some(cols => cols.length > 0)

    // 计算当前配置摘要
    const selectedTablesCount = Object.keys(columnsData).length
    const selectedColumnsCount = Object.values(selectedColumns).reduce(
        (sum, cols) => sum + cols.length, 0
    )

    // 保存预设 (自动保存步骤1选中的Token以及步骤2选中的表)
    const handleSavePreset = useCallback(async (name: string) => {
        if (selectedTokens.length === 0) {
            return { error: '请先选择 Token' }
        }

        const tokenKeys = selectedTokens.map(t => {
            const realId = (t && 'originalTokenId' in t) ? (t as any).originalTokenId : t.id
            return `token::${realId}`
        })
        const tableKeys = Array.from(selectedTableNames)
        const combinedTableNames = [...tokenKeys, ...tableKeys]

        const primaryToken = selectedTokens[0]
        const tokenId = (primaryToken && 'originalTokenId' in primaryToken)
            ? (primaryToken as any).originalTokenId
            : (primaryToken?.id || '')

        const result = await createPreset({
            token_id: tokenId,
            name,
            selected_table_names: combinedTableNames,
            columns_data: columnsData as Record<string, unknown[]>,
            selected_columns: selectedColumns,
            column_configs: columnConfigs
        })

        if (result.data) {
            setActivePresetId(result.data.id)
        }

        return { error: result.error }
    }, [selectedTokens, selectedTableNames, columnsData, selectedColumns, columnConfigs, createPreset])

    // 更新预设名称
    const handleUpdatePresetName = useCallback(async (id: string, name: string) => {
        const result = await updatePreset(id, { name })
        return { error: result.error }
    }, [updatePreset])

    // 更新预设配置（覆盖保存）
    const handleUpdatePresetConfig = useCallback(async (id: string) => {
        const tokenKeys = selectedTokens.map(t => {
            const realId = (t && 'originalTokenId' in t) ? (t as any).originalTokenId : t.id
            return `token::${realId}`
        })
        const tableKeys = Array.from(selectedTableNames)
        const combinedTableNames = [...tokenKeys, ...tableKeys]

        const result = await updatePreset(id, {
            selected_table_names: combinedTableNames,
            columns_data: columnsData as Record<string, unknown[]>,
            selected_columns: selectedColumns,
            column_configs: columnConfigs
        })
        return { error: result.error }
    }, [selectedTokens, selectedTableNames, columnsData, selectedColumns, columnConfigs, updatePreset])

    // 待同步列信息的预设 ID
    const [pendingSyncPresetId, setPendingSyncPresetId] = useState<string | null>(null)
    // 预设同步提示 Toast
    const [syncToastMessage, setSyncToastMessage] = useState<string | null>(null)

    // 自动清除 Toast 提示
    useEffect(() => {
        if (syncToastMessage) {
            const timer = setTimeout(() => {
                setSyncToastMessage(null)
            }, 6000)
            return () => clearTimeout(timer)
        }
    }, [syncToastMessage])

    // 监听 tables 变化并和加载的预设列进行同步较对
    useEffect(() => {
        if (!pendingSyncPresetId) return

        // 正在加载表时，先不进行同步，等加载完成后同步最新的 schema
        if (isLoadingTables) return

        // 若 tables 尚未加载，也继续等待
        if (tables.length === 0) return

        const preset = presets.find(p => p.id === pendingSyncPresetId)
        if (!preset) {
            setPendingSyncPresetId(null)
            return
        }

        const savedTokenIds = preset.selected_table_names
            .filter(name => name.startsWith('token::'))
            .map(name => name.replace('token::', ''))
        if (savedTokenIds.length === 0 && preset.token_id) {
            savedTokenIds.push(preset.token_id)
        }

        // 检查 preset 对应的全部 Token 表是否已加载完成 (兼容虚拟 Mock Token 的 ID)
        const loadedTokenIds = new Set(tables.map(t => t.tokenId).filter(Boolean))
        const allTokensLoaded = savedTokenIds.every(id => 
            loadedTokenIds.has(id) || loadedTokenIds.has(`preset::${preset.id}`)
        )

        if (!allTokensLoaded) {
            return
        }

        // 拉取最新的数据表列，进行比对和融合
        let hasChanges = false
        const newColumnsData: Record<string, WpsColumn[]> = {}
        const newColumnConfigs: Record<string, { name: string; fetch: boolean; sameValue?: boolean }[]> = {}
        const newSelectedColumns: Record<string, string[]> = {}

        const targetToken = selectedTokens.find(t => 
            savedTokenIds.includes(t.id) || t.id === `preset::${preset.id}`
        )
        const usePresetPrefix = targetToken?.id.startsWith('preset::') || false
        const mapKey = (key: string) => {
            if (!usePresetPrefix) return key
            const { tableName } = parseTableKey(key)
            return `preset::${preset.id}::${tableName}`
        }

        // 初始化预设中所有表的默认配置
        for (const [key, value] of Object.entries(preset.columns_data)) {
            newColumnsData[mapKey(key)] = value as WpsColumn[]
        }
        for (const [key, value] of Object.entries(preset.column_configs)) {
            newColumnConfigs[mapKey(key)] = value
        }
        for (const [key, value] of Object.entries(preset.selected_columns)) {
            newSelectedColumns[mapKey(key)] = value
        }

        const savedTableNames = preset.selected_table_names
            .filter(name => !name.startsWith('token::'))
            .map(mapKey)
        const addedColNames: string[] = []
        const renamedColNames: string[] = []

        for (const tableKey of savedTableNames) {
            const { tokenId, tableName } = parseTableKey(tableKey)

            const remoteTable = tables.find(t => t.name === tableName && (!tokenId || t.tokenId === tokenId))
            if (!remoteTable || !remoteTable.columns || remoteTable.columns.length === 0) {
                continue
            }

            const remoteCols = remoteTable.columns
            const originalTableKey = usePresetPrefix 
                ? Object.keys(preset.columns_data).find(k => parseTableKey(k).tableName === tableName) || tableKey 
                : tableKey
            const savedCols = (preset.columns_data[originalTableKey] || []) as WpsColumn[]
            const savedConfigs = preset.column_configs[originalTableKey] || []
            const savedSelected = preset.selected_columns[originalTableKey] || []

            const savedConfigMap = new Map(savedConfigs.map(c => [c.name, c]))
            const savedColMap = new Map(savedCols.map(c => {
                const scName = typeof c === 'string' ? c : c.name
                return [scName, c]
            }))
            const savedConfigNames = new Set(savedConfigs.map(c => c.name))

            const finalCols: WpsColumn[] = []
            const finalConfigs: { name: string; fetch: boolean; sameValue?: boolean }[] = []

            // 1. 未改变的列，按保存配置的顺序排列以维持自定义排序
            for (const cfg of savedConfigs) {
                const rc = remoteCols.find(r => (typeof r === 'string' ? r : r.name) === cfg.name)
                if (rc) {
                    finalCols.push(typeof rc === 'string' ? { name: rc } : rc) // 确保推入的是 WpsColumn 对象结构
                    finalConfigs.push(cfg)
                }
            }

            // 备选防御：如果在 savedCols 中有未定义在 savedConfigs 中的列，拼接到最后
            for (const sc of savedCols) {
                const scName = typeof sc === 'string' ? sc : sc.name
                if (!savedConfigNames.has(scName)) {
                    const rc = remoteCols.find(r => (typeof r === 'string' ? r : r.name) === scName)
                    if (rc) {
                        finalCols.push(typeof rc === 'string' ? { name: rc } : rc)
                        finalConfigs.push({ name: scName, fetch: true })
                    }
                }
            }

            // 2. 匹配名字发生修改的列及新增的列
            const remoteUnmatched = remoteCols.filter(rc => {
                const rcName = typeof rc === 'string' ? rc : rc.name
                return !savedColMap.has(rcName)
            })
            const savedUnmatched = savedCols.filter(sc => {
                const scName = typeof sc === 'string' ? sc : sc.name
                return !remoteCols.some(rc => (typeof rc === 'string' ? rc : rc.name) === scName)
            })

            const modifiedCols: WpsColumn[] = []
            const modifiedConfigs: { name: string; fetch: boolean; sameValue?: boolean }[] = []
            const newCols: WpsColumn[] = []
            const newConfigs: { name: string; fetch: boolean; sameValue?: boolean }[] = []

            for (const rc of remoteUnmatched) {
                const rcName = typeof rc === 'string' ? rc : rc.name
                const rcIndex = typeof rc === 'string' ? undefined : rc.columnIndex

                // 如果在 savedUnmatched 里有相同 columnIndex 且被移除的列，判定为修改列名
                const matchedSaved = rcIndex !== undefined 
                    ? savedUnmatched.find(sc => (typeof sc === 'string' ? undefined : sc.columnIndex) === rcIndex)
                    : undefined

                if (matchedSaved) {
                    const scName = typeof matchedSaved === 'string' ? matchedSaved : matchedSaved.name
                    modifiedCols.push(typeof rc === 'string' ? { name: rc } : rc)
                    const oldCfg = savedConfigMap.get(scName)
                    modifiedConfigs.push({
                        name: rcName,
                        fetch: oldCfg ? oldCfg.fetch : true,
                        sameValue: oldCfg?.sameValue
                    })
                    renamedColNames.push(`${scName} → ${rcName}`)
                } else {
                    // 否则为新增的列
                    newCols.push(typeof rc === 'string' ? { name: rc } : rc)
                    newConfigs.push({
                        name: rcName,
                        fetch: true // 默认选中显示
                    })
                    addedColNames.push(rcName)
                }
            }

            // 修改的列放到最后显示出来
            finalCols.push(...modifiedCols)
            finalConfigs.push(...modifiedConfigs)

            // 新增的列也放到最后面
            finalCols.push(...newCols)
            finalConfigs.push(...newConfigs)

            // 同步已选的搜索列名称
            const finalSelectedCols: string[] = []
            for (const name of savedSelected) {
                if (remoteCols.some(rc => (typeof rc === 'string' ? rc : rc.name) === name)) {
                    finalSelectedCols.push(name)
                } else {
                    const sc = savedCols.find(c => (typeof c === 'string' ? c : c.name) === name)
                    if (sc) {
                        const scIndex = typeof sc === 'string' ? undefined : sc.columnIndex
                        const renamedTo = scIndex !== undefined
                            ? remoteUnmatched.find(rc => (typeof rc === 'string' ? undefined : rc.columnIndex) === scIndex)
                            : undefined
                        if (renamedTo) {
                            finalSelectedCols.push(typeof renamedTo === 'string' ? renamedTo : renamedTo.name)
                        }
                    }
                }
            }

            newColumnsData[tableKey] = finalCols
            newColumnConfigs[tableKey] = finalConfigs
            newSelectedColumns[tableKey] = finalSelectedCols
            hasChanges = true
        }

        if (hasChanges) {
            setColumnsData(newColumnsData)
            setColumnConfigs(newColumnConfigs)
            setSelectedColumns(newSelectedColumns)

            if (addedColNames.length > 0 || renamedColNames.length > 0) {
                const parts: string[] = []
                if (addedColNames.length > 0) {
                    parts.push(`新增列: ${addedColNames.join(', ')}`)
                }
                if (renamedColNames.length > 0) {
                    parts.push(`修改列: ${renamedColNames.join(', ')}`)
                }
                setSyncToastMessage(`检测到数据表列有更新并已自动同步：\n${parts.join('；')}`)
            }
        }

        setPendingSyncPresetId(null)
    }, [pendingSyncPresetId, isLoadingTables, tables, presets, selectedTokens, setColumnsData, setColumnConfigs, setSelectedColumns])

    // 加载预设（支持切换取消）
    const handleLoadPreset = useCallback((preset: SearchPreset) => {
        // 如果点击的是当前激活的预设，则取消激活
        if (activePresetId === preset.id) {
            setSelectedTokens([])
            // 清空列数据
            setColumnsData({})
            // 清空选中的搜索列
            setSelectedColumns({})
            // 清空列配置
            setColumnConfigs({})
            // 取消活动预设
            setActivePresetId(null)
            // 强制展开步骤2，方便用户选择表
            setForceExpandedCounter(prev => prev + 1)
            setPendingSyncPresetId(null)
            return
        }

        // 解析并恢复选中的 Token 列表 (步骤1)
        const savedTokenIds = preset.selected_table_names
            .filter(name => name.startsWith('token::'))
            .map(name => name.replace('token::', ''))
        
        // 兼容旧版本预设 (fallback 到单个 token_id)
        if (savedTokenIds.length === 0 && preset.token_id) {
            savedTokenIds.push(preset.token_id)
        }

        let matchedTokens = tokens.filter(t => {
            if (savedTokenIds.includes(t.id)) return true
            // 如果是虚拟 Mock Token，只匹配当前预设对应的虚拟 Token，避免匹配到其他使用相同 Token ID 的预设
            if (t.id === `preset::${preset.id}`) return true
            return false
        })
        
        // 如果原 Token 未在 Token 列表中 (说明使用的是他人的共享 Token)，则生成一个虚拟 Mock Token
        if (matchedTokens.length === 0) {
            matchedTokens = [{
                id: `preset::${preset.id}`,
                originalTokenId: preset.token_id, // 保存原始的 Token ID，供以后保存/修改配置时使用
                name: `${preset.name} (预设限制使用)`,
                token_value: '', // 不暴露真实 Token 值
                webhook_url: 'preset-webhook', // 哑 Webhook 占位
                is_active: true,
                user_id: preset.user_id,
                description: `来自搜索预设分享`
            } as any]
        }
        
        setSelectedTokens(matchedTokens)

        // 提取并恢复选中的表名列表 (步骤2)
        let savedTableNames = preset.selected_table_names.filter(name => !name.startsWith('token::'))
        let savedColumnsData = preset.columns_data as Record<string, WpsColumn[]>
        let savedSelectedColumns = preset.selected_columns as Record<string, string[]>
        let savedColumnConfigs = preset.column_configs as Record<string, any[]>

        // 如果是使用虚拟预设 Token ID，将表名主键映射到虚拟预设 Token ID
        const targetToken = matchedTokens[0]
        if (targetToken && targetToken.id.startsWith('preset::')) {
            const mapKey = (key: string) => {
                const { tableName } = parseTableKey(key)
                return `${targetToken.id}::${tableName}`
            }

            savedTableNames = savedTableNames.map(mapKey)

            const mappedColumnsData: Record<string, WpsColumn[]> = {}
            for (const [key, val] of Object.entries(savedColumnsData)) {
                mappedColumnsData[mapKey(key)] = val
            }
            savedColumnsData = mappedColumnsData

            const mappedSelectedColumns: Record<string, string[]> = {}
            for (const [key, val] of Object.entries(savedSelectedColumns)) {
                mappedSelectedColumns[mapKey(key)] = val
            }
            savedSelectedColumns = mappedSelectedColumns

            const mappedColumnConfigs: Record<string, any[]> = {}
            for (const [key, val] of Object.entries(savedColumnConfigs)) {
                mappedColumnConfigs[mapKey(key)] = val
            }
            savedColumnConfigs = mappedColumnConfigs
        }

        setSelectedTableNames(new Set(savedTableNames))

        // 先恢复缓存中的预设配置（让UI立刻展现）
        setColumnsData(savedColumnsData)
        setSelectedColumns(savedSelectedColumns)
        setColumnConfigs(savedColumnConfigs)
        setActivePresetId(preset.id)

        // 记录 pendingSync, 以便在 table list 刷新/获取后同步
        setPendingSyncPresetId(preset.id)

        // 主动触发拉取最新数据表列信息
        refreshTables(matchedTokens).catch(err => {
            console.error('Preset load pull schema failed:', err)
        })

        // 强制收起步骤1、2、3
        setForceCollapsedCounter(prev => prev + 1)
    }, [activePresetId, tokens, setSelectedTokens, setSelectedTableNames, setColumnsData, setSelectedColumns, setColumnConfigs, refreshTables, currentUser])

    // 编辑预设
    const handleEditPreset = useCallback((preset: SearchPreset) => {
        setEditingPreset(preset)
        setIsSaveModalOpen(true)
    }, [])

    // 删除预设
    const handleDeletePreset = useCallback(async (presetId: string) => {
        await deletePreset(presetId)
        if (activePresetId === presetId) {
            setActivePresetId(null)
        }
    }, [deletePreset, activePresetId])

    // 打开保存弹窗
    const openSaveModal = useCallback(() => {
        setEditingPreset(null)
        setIsSaveModalOpen(true)
    }, [])

    // 关闭保存弹窗
    const closeSaveModal = useCallback(() => {
        setIsSaveModalOpen(false)
        setEditingPreset(null)
    }, [])

    return (
        <div className="w-full">
            <div className="mb-8">
                <div className="flex flex-wrap items-center gap-4 mb-2">
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <span>📦</span>
                        件号快速查找
                    </h1>
                    {/* 预设栏 */}
                    <PresetBar
                        presets={presets}
                        activePresetId={activePresetId}
                        isLoading={isLoadingPresets}
                        onLoadPreset={handleLoadPreset}
                        onEditPreset={handleEditPreset}
                        onDeletePreset={handleDeletePreset}
                        currentUserId={currentUser?.id}
                    />
                </div>
                <p className="text-[var(--text-muted)]">
                    在 WPS 表格 / Google Sheets 中搜索件号和配件信息
                </p>
            </div>

            <div className="space-y-6">
                {/* Step 1: Token Selection */}
                <TokenSelector
                    tokens={tokens}
                    selectedTokens={selectedTokens}
                    isLoading={isLoadingTokens}
                    onToggle={withResetPreset(toggleToken)}
                    onSelectAll={withResetPreset(selectAllTokens)}
                    onDeselectAll={withResetPreset(deselectAllTokens)}
                    forceCollapsed={forceCollapsedCounter}
                />

                {/* Step 2: Table Selection */}
                {selectedTokens.length > 0 && (
                    <TableSelector
                        tables={tables}
                        selectedTableNames={selectedTableNames}
                        isLoading={isLoadingTables}
                        error={tablesError}
                        onToggle={withResetPreset(toggleTable)}
                        onSelectAll={withResetPreset(selectAllTables)}
                        onDeselectAll={withResetPreset(deselectAllTables)}
                        onLoadColumns={loadColumnsForSelected}
                        columnsData={columnsData}
                        forceCollapsed={forceCollapsedCounter}
                        forceExpanded={forceExpandedCounter}
                        refreshTokensCache={refreshTokensCache}
                        onRefreshTokensCacheChange={setRefreshTokensCache}
                    />
                )}

                {/* Step 3: Column Selection */}
                {Object.keys(columnsData).length > 0 && (
                    <ColumnSelector
                        columnsData={columnsData}
                        selectedColumns={selectedColumns}
                        columnConfigs={columnConfigs}
                        selectedTokens={selectedTokens}
                        onToggle={withResetPreset(toggleColumn)}
                        onConfigChange={(tableKey, newConfig) => {
                            setActivePresetId(null)
                            setColumnConfigs(prev => ({
                                ...prev,
                                [tableKey]: newConfig
                            }))
                            // 同时对 columnsData 对应表格的列进行重新排序，保持与配置的自定义顺序一致
                            setColumnsData(prev => {
                                const cols = prev[tableKey]
                                if (!cols) return prev
                                const colMap = new Map(cols.map(c => [c.name, c]))
                                const sortedCols = newConfig
                                    .map(cfg => colMap.get(cfg.name))
                                    .filter((c): c is WpsColumn => !!c)
                                return {
                                    ...prev,
                                    [tableKey]: sortedCols
                                }
                            })
                        }}
                        onSelectAll={withResetPreset(selectAllColumns)}
                        onDeselectAll={withResetPreset(deselectAllColumns)}
                        onFetchAll={withResetPreset(fetchAllColumns)}
                        onUnfetchAll={withResetPreset(unfetchAllColumns)}
                        onDuplicate={withResetPreset(duplicateTable)}
                        onRemove={withResetPreset(removeTableCopy)}
                        forceCollapsed={forceCollapsedCounter}
                        forceExpanded={step3ExpandedCounter}
                    />
                )}

                {/* Step 4: Search Form */}
                {hasSelectedColumns && (
                    <SearchForm
                        selectedColumns={selectedColumns}
                        isSearching={isSearching}
                        onSearch={performSearch}
                        selectedTokens={selectedTokens}
                        onExport={exportToExcel}
                        isExporting={isExporting}
                        autoLoadImages={autoLoadImages}
                        onAutoLoadImagesChange={setAutoLoadImages}
                        onDownloadTemplate={downloadBatchTemplate}
                        onBatchSearch={performBatchSearch}
                        isBatchSearching={isBatchSearching}
                        onPasteSearch={performPasteSearch}
                        batchProgress={batchProgress}
                        columnConfigs={columnConfigs}
                        onSavePreset={openSaveModal}
                        forceExpanded={step4ExpandedCounter}
                    />
                )}

                {/* Error Display */}
                {searchError && (
                    <div className="alert alert-error flex items-center gap-3">
                        <span className="text-xl">⚠️</span>
                        <div>
                            <div className="font-semibold">操作失败</div>
                            <div className="text-sm mt-1">{searchError}</div>
                        </div>
                    </div>
                )}

                {/* Results */}
                <ResultTable
                    results={searchResults}
                    isSearching={isSearching}
                    searchingTables={searchingTables}
                    tokenId={selectedToken?.id}
                    autoLoadImages={autoLoadImages}
                    onImageLoad={handleImageLoad}
                    imageUrlCache={imageUrlCache}
                    onExportSingle={exportSingleResult}
                    modifiedCells={modifiedCells}
                    updateCell={updateCell}
                    revertChanges={revertChanges}
                    saveChanges={saveChanges}
                    onDeleteRows={deleteRows}
                    onLoadMore={loadMore}
                />
            </div>

            {/* 保存预设弹窗 */}
            <SavePresetModal
                isOpen={isSaveModalOpen}
                onClose={closeSaveModal}
                onSave={handleSavePreset}
                onUpdateConfig={handleUpdatePresetConfig}
                onUpdateName={handleUpdatePresetName}
                editingPreset={editingPreset}
                existingPresets={presets.filter(p => p.user_id === currentUser?.id)}
                selectedTablesCount={selectedTablesCount}
                selectedColumnsCount={selectedColumnsCount}
            />

            {/* Sync Alert Toast */}
            {syncToastMessage && (
                <div className="fixed bottom-6 right-6 z-[9999] max-w-sm px-4 py-3 rounded-xl bg-amber-500 text-white text-sm font-medium shadow-2xl border border-amber-400 animate-in fade-in slide-in-from-bottom-4 duration-300 flex items-start gap-3">
                    <span className="text-base mt-0.5">🔔</span>
                    <div className="flex-1 whitespace-pre-line text-left">
                        {syncToastMessage}
                    </div>
                    <button 
                        onClick={() => setSyncToastMessage(null)}
                        className="text-white/80 hover:text-white ml-2 text-xs font-bold font-mono"
                    >
                        ✕
                    </button>
                </div>
            )}
        </div>
    )
}
