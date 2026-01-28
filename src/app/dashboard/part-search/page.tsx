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
        selectToken,
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
        setSelectedColumns
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
    const [forceExpandedCounter, setForceExpandedCounter] = useState(0)

    // 当 Token 变化时，加载该 Token 的预设
    useEffect(() => {
        if (selectedToken?.id) {
            fetchPresets(selectedToken.id)
            setActivePresetId(null)
        } else {
            clearPresets()
            setActivePresetId(null)
        }
    }, [selectedToken?.id, fetchPresets, clearPresets])

    // 检查是否已选择列
    const hasSelectedColumns = Object.values(selectedColumns).some(cols => cols.length > 0)

    // 计算当前配置摘要
    const selectedTablesCount = Object.keys(columnsData).length
    const selectedColumnsCount = Object.values(selectedColumns).reduce(
        (sum, cols) => sum + cols.length, 0
    )

    // 保存预设
    const handleSavePreset = useCallback(async (name: string) => {
        if (!selectedToken?.id) {
            return { error: '请先选择 Token' }
        }

        const result = await createPreset({
            token_id: selectedToken.id,
            name,
            selected_table_names: Array.from(selectedTableNames),
            columns_data: columnsData as Record<string, unknown[]>,
            selected_columns: selectedColumns,
            column_configs: columnConfigs
        })

        if (result.data) {
            setActivePresetId(result.data.id)
        }

        return { error: result.error }
    }, [selectedToken?.id, selectedTableNames, columnsData, selectedColumns, columnConfigs, createPreset])

    // 更新预设名称
    const handleUpdatePresetName = useCallback(async (id: string, name: string) => {
        const result = await updatePreset(id, { name })
        return { error: result.error }
    }, [updatePreset])

    // 更新预设配置（覆盖保存）
    const handleUpdatePresetConfig = useCallback(async (id: string) => {
        const result = await updatePreset(id, {
            selected_table_names: Array.from(selectedTableNames),
            columns_data: columnsData as Record<string, unknown[]>,
            selected_columns: selectedColumns,
            column_configs: columnConfigs
        })
        return { error: result.error }
    }, [selectedTableNames, columnsData, selectedColumns, columnConfigs, updatePreset])

    // 加载预设（支持切换取消）
    const handleLoadPreset = useCallback((preset: SearchPreset) => {
        // 如果点击的是当前激活的预设，则取消激活
        if (activePresetId === preset.id) {
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
            return
        }

        // 设置选中的表名
        setSelectedTableNames(new Set(preset.selected_table_names))

        // 设置列数据
        setColumnsData(preset.columns_data as Record<string, WpsColumn[]>)

        // 设置选中的搜索列
        setSelectedColumns(preset.selected_columns)

        // 设置列配置
        setColumnConfigs(preset.column_configs)

        // 设置当前活动预设
        setActivePresetId(preset.id)

        // 强制收起步骤1、2、3
        setForceCollapsedCounter(prev => prev + 1)
    }, [activePresetId, setSelectedTableNames, setColumnsData, setSelectedColumns, setColumnConfigs])

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
                    {selectedToken && (
                        <PresetBar
                            presets={presets}
                            activePresetId={activePresetId}
                            isLoading={isLoadingPresets}
                            onLoadPreset={handleLoadPreset}
                            onEditPreset={handleEditPreset}
                            onDeletePreset={handleDeletePreset}
                        />
                    )}
                </div>
                <p className="text-[var(--text-muted)]">
                    在 WPS 多维表格 / 智能表格中搜索件号和配件信息
                </p>
            </div>

            <div className="space-y-6">
                {/* Step 1: Token Selection */}
                <TokenSelector
                    tokens={tokens}
                    selectedToken={selectedToken}
                    isLoading={isLoadingTokens}
                    onSelect={selectToken}
                    forceCollapsed={forceCollapsedCounter}
                />

                {/* Step 2: Table Selection */}
                {selectedToken && (
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
                    />
                )}

                {/* Step 4: Search Form */}
                {hasSelectedColumns && (
                    <SearchForm
                        selectedColumns={selectedColumns}
                        isSearching={isSearching}
                        onSearch={performSearch}
                        onExport={exportToExcel}
                        isExporting={isExporting}
                        autoLoadImages={autoLoadImages}
                        onAutoLoadImagesChange={setAutoLoadImages}
                        onDownloadTemplate={downloadBatchTemplate}
                        onBatchSearch={performBatchSearch}
                        isBatchSearching={isBatchSearching}
                        onPasteSearch={performPasteSearch}
                        batchProgress={batchProgress}
                        onSavePreset={openSaveModal}
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
        </div>
    )
}
