'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePartSearch } from '@/hooks/usePartSearch'
import { useSearchPresets } from '@/hooks/useSearchPresets'
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
        performSearch,
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

        const tokenKeys = selectedTokens.map(t => `token::${t.id}`)
        const tableKeys = Array.from(selectedTableNames)
        const combinedTableNames = [...tokenKeys, ...tableKeys]

        const result = await createPreset({
            token_id: selectedTokens[0]?.id || '',
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
        const tokenKeys = selectedTokens.map(t => `token::${t.id}`)
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

        // 检查 preset 对应的全部 Token 表是否已加载完成
        const loadedTokenIds = new Set(tables.map(t => t.tokenId).filter(Boolean))
        const allTokensLoaded = savedTokenIds.every(id => loadedTokenIds.has(id))

        if (!allTokensLoaded) {
            return
        }

        // 拉取最新的数据表列，进行比对和融合
        let hasChanges = false
        const newColumnsData: Record<string, WpsColumn[]> = {}
        const newColumnConfigs: Record<string, { name: string; fetch: boolean; sameValue?: boolean }[]> = {}
        const newSelectedColumns: Record<string, string[]> = {}

        // 初始化预设中所有表的默认配置
        for (const [key, value] of Object.entries(preset.columns_data)) {
            newColumnsData[key] = value as WpsColumn[]
        }
        for (const [key, value] of Object.entries(preset.column_configs)) {
            newColumnConfigs[key] = value
        }
        for (const [key, value] of Object.entries(preset.selected_columns)) {
            newSelectedColumns[key] = value
        }

        const savedTableNames = preset.selected_table_names.filter(name => !name.startsWith('token::'))
        const addedColNames: string[] = []
        const renamedColNames: string[] = []

        for (const tableKey of savedTableNames) {
            let tokenId = ''
            let tableName = tableKey
            if (tableKey.includes('::')) {
                const parts = tableKey.split('::')
                tokenId = parts[0]
                tableName = parts[1]
            }

            const remoteTable = tables.find(t => t.name === tableName && (!tokenId || t.tokenId === tokenId))
            if (!remoteTable || !remoteTable.columns || remoteTable.columns.length === 0) {
                continue
            }

            const remoteCols = remoteTable.columns
            const savedCols = (preset.columns_data[tableKey] || []) as WpsColumn[]
            const savedConfigs = preset.column_configs[tableKey] || []
            const savedSelected = preset.selected_columns[tableKey] || []

            const savedConfigMap = new Map(savedConfigs.map(c => [c.name, c]))
            const savedColMap = new Map(savedCols.map(c => [c.name, c]))

            const finalCols: WpsColumn[] = []
            const finalConfigs: { name: string; fetch: boolean; sameValue?: boolean }[] = []

            // 1. 未改变的列，按保存的顺序排列
            for (const sc of savedCols) {
                const rc = remoteCols.find(r => r.name === sc.name)
                if (rc) {
                    finalCols.push(rc) // 使用最新的 remote 属性（如最新的 columnIndex 等）
                    const savedCfg = savedConfigMap.get(sc.name)
                    finalConfigs.push(savedCfg || { name: rc.name, fetch: true })
                }
            }

            // 2. 匹配名字发生修改的列及新增的列
            const remoteUnmatched = remoteCols.filter(rc => !savedColMap.has(rc.name))
            const savedUnmatched = savedCols.filter(sc => !remoteCols.some(rc => rc.name === sc.name))

            const modifiedCols: WpsColumn[] = []
            const modifiedConfigs: { name: string; fetch: boolean; sameValue?: boolean }[] = []
            const newCols: WpsColumn[] = []
            const newConfigs: { name: string; fetch: boolean; sameValue?: boolean }[] = []

            for (const rc of remoteUnmatched) {
                // 如果在 savedUnmatched 里有相同 columnIndex 且被移除的列，判定为修改列名
                const matchedSaved = savedUnmatched.find(sc => sc.columnIndex === rc.columnIndex)
                if (matchedSaved) {
                    modifiedCols.push(rc)
                    const oldCfg = savedConfigMap.get(matchedSaved.name)
                    modifiedConfigs.push({
                        name: rc.name,
                        fetch: oldCfg ? oldCfg.fetch : true,
                        sameValue: oldCfg?.sameValue
                    })
                    renamedColNames.push(`${matchedSaved.name} → ${rc.name}`)
                } else {
                    // 否则为新增的列
                    newCols.push(rc)
                    newConfigs.push({
                        name: rc.name,
                        fetch: true // 默认选中显示
                    })
                    addedColNames.push(rc.name)
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
                if (remoteCols.some(rc => rc.name === name)) {
                    finalSelectedCols.push(name)
                } else {
                    const sc = savedCols.find(c => c.name === name)
                    if (sc) {
                        const renamedTo = remoteUnmatched.find(rc => rc.columnIndex === sc.columnIndex)
                        if (renamedTo) {
                            finalSelectedCols.push(renamedTo.name)
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
    }, [pendingSyncPresetId, isLoadingTables, tables, presets, setColumnsData, setColumnConfigs, setSelectedColumns])

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

        const matchedTokens = tokens.filter(t => savedTokenIds.includes(t.id))
        setSelectedTokens(matchedTokens)

        // 提取并恢复选中的表名列表 (步骤2)
        const savedTableNames = preset.selected_table_names.filter(name => !name.startsWith('token::'))
        setSelectedTableNames(new Set(savedTableNames))

        // 先恢复缓存中的预设配置（让UI立刻展现）
        setColumnsData(preset.columns_data as Record<string, WpsColumn[]>)
        setSelectedColumns(preset.selected_columns)
        setColumnConfigs(preset.column_configs)
        setActivePresetId(preset.id)

        // 记录 pendingSync, 以便在 table list 刷新/获取后同步
        setPendingSyncPresetId(preset.id)

        // 主动触发拉取最新数据表列信息
        refreshTables(matchedTokens).catch(err => {
            console.error('Preset load pull schema failed:', err)
        })

        // 强制收起步骤1、2、3
        setForceCollapsedCounter(prev => prev + 1)
    }, [activePresetId, tokens, setSelectedTokens, setSelectedTableNames, setColumnsData, setSelectedColumns, setColumnConfigs, refreshTables])

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
                    onToggle={toggleToken}
                    onSelectAll={selectAllTokens}
                    onDeselectAll={deselectAllTokens}
                    forceCollapsed={forceCollapsedCounter}
                />

                {/* Step 2: Table Selection */}
                {selectedTokens.length > 0 && (
                    <TableSelector
                        tables={tables}
                        selectedTableNames={selectedTableNames}
                        isLoading={isLoadingTables}
                        error={tablesError}
                        onToggle={toggleTable}
                        onSelectAll={selectAllTables}
                        onDeselectAll={deselectAllTables}
                        onLoadColumns={loadColumnsForSelected}
                        columnsData={columnsData}
                        forceCollapsed={forceCollapsedCounter}
                        forceExpanded={forceExpandedCounter}
                    />
                )}

                {/* Step 3: Column Selection */}
                {Object.keys(columnsData).length > 0 && (
                    <ColumnSelector
                        columnsData={columnsData}
                        selectedColumns={selectedColumns}
                        columnConfigs={columnConfigs}
                        selectedTokens={selectedTokens}
                        onToggle={toggleColumn}
                        onConfigChange={(tableKey, newConfig) => {
                            setColumnConfigs(prev => ({
                                ...prev,
                                [tableKey]: newConfig
                            }))
                        }}
                        onSelectAll={selectAllColumns}
                        onDeselectAll={deselectAllColumns}
                        onFetchAll={fetchAllColumns}
                        onUnfetchAll={unfetchAllColumns}
                        onDuplicate={duplicateTable}
                        onRemove={removeTableCopy}
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
                existingPresets={presets}
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
