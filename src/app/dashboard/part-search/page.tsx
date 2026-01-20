'use client'

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
        searchResults,
        isSearching,
        searchError,
        performSearch
    } = usePartSearch()

    // 检查是否已选择列
    const hasSelectedColumns = Object.values(selectedColumns).some(cols => cols.length > 0)

    return (
        <div className="max-w-6xl">
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
                    />
                )}

                {/* Step 3: Column Selection */}
                {Object.keys(columnsData).length > 0 && (
                    <ColumnSelector
                        columnsData={columnsData}
                        selectedColumns={selectedColumns}
                        onToggle={toggleColumn}
                        onSelectAll={selectAllColumns}
                        onDeselectAll={deselectAllColumns}
                    />
                )}

                {/* Step 4: Search Form */}
                {hasSelectedColumns && (
                    <SearchForm
                        selectedColumns={selectedColumns}
                        isSearching={isSearching}
                        onSearch={performSearch}
                    />
                )}

                {/* Error Display */}
                {searchError && (
                    <div className="alert alert-error">{searchError}</div>
                )}

                {/* Results */}
                <ResultTable results={searchResults} isSearching={isSearching} />
            </div>
        </div>
    )
}
