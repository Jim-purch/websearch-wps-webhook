'use client'

import { useState } from 'react'
import { usePartSearch } from '@/hooks/usePartSearch'
import {
    TokenSelector,
    TableSelector,
    ColumnSelector,
    SearchForm,
    ResultTable
} from '@/components/part-search'

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
        setColumnConfigs
    } = usePartSearch()

    // 自动加载图片选项
    const [autoLoadImages, setAutoLoadImages] = useState(false)

    // 检查是否已选择列
    const hasSelectedColumns = Object.values(selectedColumns).some(cols => cols.length > 0)

    return (
        <div className="w-full">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">
                    <span className="mr-2">📦</span>
                    件号快速查找
                </h1>
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
        </div>
    )
}
