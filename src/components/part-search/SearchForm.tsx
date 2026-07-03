'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { SearchCondition } from '@/hooks/usePartSearch'
import { PasteQueryModal, type PasteQueryData } from './PasteQueryModal'
import type { Token } from '@/types'

interface SearchFormProps {
    selectedColumns: Record<string, string[]>
    isSearching: boolean
    onSearch: (conditions: SearchCondition[], sameValueParams?: { values: string[]; op: 'Contains' | 'Equals' }) => void
    selectedTokens?: Token[]
    onExport?: () => void
    isExporting?: boolean
    autoLoadImages: boolean
    onAutoLoadImagesChange: (value: boolean) => void
    // Batch Search Props
    onDownloadTemplate?: () => void
    onBatchSearch?: (file: File, matchMode?: 'fuzzy' | 'exact', batchSize?: number, batchLimit?: number) => void
    isBatchSearching?: boolean
    onPasteSearch?: (tableKey: string, data: Array<{ id: string; values: Record<string, string> }>, matchMode: 'fuzzy' | 'exact', batchSize?: number, batchLimit?: number) => void
    batchProgress?: string
    columnConfigs: Record<string, any[]> // 添加列配置用于识别同值搜索字段
    // Preset Props
    onSavePreset?: () => void
    // Expand control
    forceExpanded?: number // 展开计数器，每次变化时强制展开
}

interface InputState {
    value: string
    op: 'Contains' | 'Equals'
}

export function SearchForm({
    selectedColumns,
    isSearching,
    onSearch,
    selectedTokens = [],
    onExport,
    isExporting = false,
    autoLoadImages,
    onAutoLoadImagesChange,
    onDownloadTemplate,
    onBatchSearch,
    isBatchSearching = false,
    onPasteSearch,
    batchProgress,
    columnConfigs,
    onSavePreset,
    forceExpanded
}: SearchFormProps) {
    
    // 找出所有选中的且配置为 sameValue 的字段
    const sameValueCols = useMemo(() => {
        const cols: Array<{ tableKey: string; columnName: string; displayName: string }> = []
        for (const [tableKey, columns] of Object.entries(selectedColumns)) {
            const configs = columnConfigs[tableKey] || []
            
            // 格式化表名：增加 Token 名称前缀
            let name = tableKey
            let tokenId = ''
            if (tableKey.includes('::')) {
                const parts = tableKey.split('::')
                tokenId = parts[0]
                name = parts[1]
            }
            const baseName = name.includes('__copy_')
                ? `${name.split('__copy_')[0]} (副本${name.split('__copy_')[1]})`
                : name
            const tokenName = selectedTokens.find(t => t.id === tokenId)?.name
            const tableDisplayName = tokenName ? `[${tokenName}] ${baseName}` : baseName

            for (const columnName of columns) {
                const config = configs.find(c => c.name === columnName)
                if (config && config.sameValue) {
                    cols.push({
                        tableKey,
                        columnName,
                        displayName: `${tableDisplayName}.${columnName}`
                    })
                }
            }
        }
        return cols
    }, [selectedColumns, columnConfigs, selectedTokens])

    // 过滤掉同值批量搜索的字段，只展示常规的独立搜索字段
    const inputKeys = useMemo(() => {
        const keys: Array<{ tableName: string; columnName: string }> = []
        for (const [tableName, columns] of Object.entries(selectedColumns)) {
            const configs = columnConfigs[tableName] || []
            for (const columnName of columns) {
                const config = configs.find(c => c.name === columnName)
                if (config && config.sameValue) {
                    continue // 同值批量字段跳过常规网格显示
                }
                keys.push({ tableName, columnName })
            }
        }
        return keys
    }, [selectedColumns, columnConfigs])

    const [inputs, setInputs] = useState<Record<string, InputState>>({})
    const [isOpen, setIsOpen] = useState(true)
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false)
    const [batchMatchMode, setBatchMatchMode] = useState<'fuzzy' | 'exact'>('exact')
    const [batchSize, setBatchSize] = useState<number>(50) // 默认 50
    const [batchLimit, setBatchLimit] = useState<number>(30) // 默认 30
    const [pasteModalTableKey, setPasteModalTableKey] = useState<string | null>(null)
    const [pasteData, setPasteData] = useState<Record<string, PasteQueryData>>({})

    // 同值批量搜索状态
    const [sameValueInput, setSameValueInput] = useState('')
    const [sameValueOp, setSameValueOp] = useState<'Contains' | 'Equals'>('Contains')

    // 处理粘贴数据变化
    const handlePasteDataChange = useCallback((tableKey: string, data: PasteQueryData) => {
        setPasteData(prev => ({
            ...prev,
            [tableKey]: data
        }))
    }, [])

    // 当外部强制展开时
    useEffect(() => {
        if (forceExpanded && forceExpanded > 0) {
            setIsOpen(true)
        }
    }, [forceExpanded])

    const handleInputChange = (key: string, value: string) => {
        setInputs(prev => ({
            ...prev,
            [key]: { ...prev[key], value, op: prev[key]?.op || 'Contains' }
        }))
    }

    const handleOpChange = (key: string, op: 'Contains' | 'Equals') => {
        setInputs(prev => ({
            ...prev,
            [key]: { ...prev[key], op, value: prev[key]?.value || '' }
        }))
    }

    const getConditions = () => {
        return inputKeys
            .map(({ tableName, columnName }) => {
                const key = `${tableName}__${columnName}`
                const input = inputs[key]
                return {
                    tableName,
                    columnName,
                    searchValue: input?.value || '',
                    op: input?.op || 'Contains'
                }
            })
            .filter(c => c.searchValue.trim() !== '') as SearchCondition[]
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        
        const sameValueValues = sameValueInput
            .split('\n')
            .map(v => v.trim())
            .filter(v => v !== '')

        onSearch(getConditions(), {
            values: sameValueValues,
            op: sameValueOp
        })
    }

    const handleExport = () => {
        if (onExport) {
            onExport()
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file && onBatchSearch) {
            onBatchSearch(file, batchMatchMode, batchSize, batchLimit)
            e.target.value = ''
            setIsBatchModalOpen(false)
        }
    }

    const openBatchModal = () => {
        setInputs({})
        setSameValueInput('')
        setIsBatchModalOpen(true)
    }

    // 判断是否有任意搜索字段被选中 (独立或同值)
    const hasAnyFields = inputKeys.length > 0 || sameValueCols.length > 0
    if (!hasAnyFields) {
        return null
    }

    return (
        <div className="card">
            <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <span className="text-xl">🔍</span>
                    步骤 4: 搜索条件
                </h3>
                <div className="flex items-center gap-3">
                    {onSavePreset && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                onSavePreset()
                            }}
                            className="text-xs px-3 py-1.5 rounded-md bg-gradient-to-r from-[#10b981] to-[#34d399] text-white font-medium hover:from-[#059669] hover:to-[#10b981] transition-all shadow-md hover:shadow-lg flex items-center gap-1.5 border border-[#10b981]/30"
                            title="保存当前搜索配置为预设"
                        >
                            <span>💾</span>
                            保存预设
                        </button>
                    )}
                    <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                        ▼
                    </span>
                </div>
            </div>

            {isOpen && (
                <div className="p-6 pt-0 border-t border-transparent">
                    <form onSubmit={handleSubmit}>
                        
                        {/* 同值批量搜索区域 */}
                        {sameValueCols.length > 0 && (
                            <div className="mb-6 rounded-lg border border-[rgba(234,179,8,0.3)] bg-[rgba(234,179,8,0.02)] p-4 space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(234,179,8,0.15)] pb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">🔗</span>
                                        <span className="font-semibold text-[#eab308]">同值联合批量搜索</span>
                                        <span className="text-xs text-[var(--text-muted)]">(跨表/跨字段一次性查询相同的一列值)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-[var(--text-muted)]">匹配模式：</span>
                                        <div className="flex rounded-md border border-[var(--border)] overflow-hidden">
                                            <button
                                                type="button"
                                                onClick={() => setSameValueOp('Equals')}
                                                className={`px-2.5 py-1 text-xs transition-all ${sameValueOp === 'Equals'
                                                    ? 'bg-[#eab308] text-black font-semibold'
                                                    : 'bg-[var(--card-bg)] text-[var(--text-muted)]'
                                                }`}
                                            >
                                                精确
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSameValueOp('Contains')}
                                                className={`px-2.5 py-1 text-xs transition-all ${sameValueOp === 'Contains'
                                                    ? 'bg-[#eab308] text-black font-semibold'
                                                    : 'bg-[var(--card-bg)] text-[var(--text-muted)]'
                                                }`}
                                            >
                                                模糊
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* 已绑定的列标签 */}
                                <div className="flex flex-wrap gap-2 items-center">
                                    <span className="text-xs text-[var(--text-muted)]">生效字段:</span>
                                    {sameValueCols.map(col => (
                                        <span key={col.displayName} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-[rgba(234,179,8,0.15)] border border-[rgba(234,179,8,0.3)] text-[#eab308]">
                                            <span>📊</span>
                                            {col.displayName}
                                        </span>
                                    ))}
                                </div>

                                {/* 批量输入区域 */}
                                <div className="flex flex-col gap-1.5">
                                    <textarea
                                        value={sameValueInput}
                                        onChange={(e) => setSameValueInput(e.target.value)}
                                        placeholder="请在此输入要搜索的相同值列表，一行一个。支持从 Excel 直接复制整列数据粘贴到此处。"
                                        className="textarea w-full font-mono text-sm border-[var(--border)] focus:border-[#eab308] focus:ring-1 focus:ring-[#eab308] bg-[var(--card-bg)] rounded-lg p-3 resize-y min-h-[120px]"
                                    />
                                    <span className="text-xs text-[var(--text-muted)] text-right">
                                        已输入 {sameValueInput.split('\n').filter(v => v.trim() !== '').length} 行
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* 常规独立条件字段 */}
                        {inputKeys.length > 0 && (
                            <div className="space-y-4 mb-6">
                                {Object.entries(selectedColumns).map(([tableKey, columns]) => {
                                    // 检查该表是否含有处于常规检索下的字段
                                    const visibleColumns = columns.filter(colName => {
                                        const config = columnConfigs[tableKey]?.find(c => c.name === colName)
                                        return !config || !config.sameValue
                                    })
                                    if (visibleColumns.length === 0) return null

                                    // 格式化表名 (加上 Token 归属)
                                    let name = tableKey
                                    let tokenId = ''
                                    if (tableKey.includes('::')) {
                                        const parts = tableKey.split('::')
                                        tokenId = parts[0]
                                        name = parts[1]
                                    }
                                    const baseName = name.includes('__copy_')
                                        ? `${name.split('__copy_')[0]} (副本${name.split('__copy_')[1]})`
                                        : name
                                    const tokenName = selectedTokens.find(t => t.id === tokenId)?.name
                                    const displayName = tokenName ? `[${tokenName}] ${baseName}` : baseName

                                    return (
                                        <div
                                            key={tableKey}
                                            className="rounded-lg border border-[var(--border)] overflow-hidden"
                                        >
                                            <div className="bg-[rgba(234,179,8,0.1)] px-4 py-2 border-b border-[var(--border)] flex items-center gap-3">
                                                {onPasteSearch && visibleColumns.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setPasteModalTableKey(tableKey)
                                                        }}
                                                        className="text-xs px-3 py-1.5 rounded-md bg-gradient-to-r from-[#8b5cf6] to-[#a78bfa] text-white font-medium hover:from-[#7c3aed] hover:to-[#8b5cf6] transition-all shadow-md hover:shadow-lg flex items-center gap-1.5 border border-[#8b5cf6]/30"
                                                        title="粘贴 Excel 数据进行批量查询"
                                                    >
                                                        <span>📋</span>
                                                        粘贴列查询
                                                    </button>
                                                )}
                                                <span className="text-[#eab308] font-medium flex items-center gap-2">
                                                    <span>📊</span>
                                                    {displayName}
                                                </span>
                                            </div>
                                            <div className="p-4 bg-[var(--card-bg)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                                                {visibleColumns.map((columnName) => {
                                                    const key = `${tableKey}__${columnName}`
                                                    const input = inputs[key] || { value: '', op: 'Contains' }
                                                    const isExact = input.op === 'Equals'

                                                    return (
                                                        <div
                                                            key={key}
                                                            className="flex flex-col gap-1.5"
                                                        >
                                                            <div
                                                                onClick={() => handleOpChange(key, isExact ? 'Contains' : 'Equals')}
                                                                className="cursor-pointer flex items-center gap-2 select-none group w-fit"
                                                                title="点击切换模糊/精确搜索"
                                                            >
                                                                <span className={`
                                                                    text-sm font-medium transition-colors
                                                                    ${isExact
                                                                        ? 'text-[#667eea] font-bold'
                                                                        : 'text-[var(--text-muted)] group-hover:text-[var(--foreground)]'
                                                                    }
                                                                `}>
                                                                    {columnName}
                                                                </span>
                                                                <span className={`
                                                                    text-[10px] px-1.5 py-0.5 rounded border transition-all
                                                                    ${isExact
                                                                        ? 'bg-[rgba(102,126,234,0.1)] text-[#667eea] border-[#667eea]'
                                                                        : 'bg-transparent text-[var(--text-muted)] border-[var(--border)]'
                                                                    }
                                                                `}>
                                                                    {isExact ? '精确' : '模糊'}
                                                                </span>
                                                            </div>
                                                            <input
                                                                type="text"
                                                                value={input.value}
                                                                onChange={(e) => handleInputChange(key, e.target.value)}
                                                                placeholder="输入搜索关键字..."
                                                                className="input w-full"
                                                            />
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        <div className="text-center flex flex-wrap justify-center items-center gap-4">
                            {/* 自动加载图片选项 */}
                            <label
                                className="flex items-center gap-2 cursor-pointer select-none px-3 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--hover-bg)] transition-colors"
                                title="开启后，搜索结果中的图片会自动加载显示"
                            >
                                <input
                                    type="checkbox"
                                    checked={autoLoadImages}
                                    onChange={(e) => onAutoLoadImagesChange(e.target.checked)}
                                    className="w-4 h-4 accent-[#eab308]"
                                />
                                <span className="text-sm flex items-center gap-1">
                                    <span>🖼️</span>
                                    自动加载图片
                                </span>
                            </label>

                            <button
                                type="submit"
                                disabled={isSearching || isExporting}
                                className="btn-primary px-4 py-2 text-sm w-full sm:w-auto min-w-[120px]"
                            >
                                {isSearching ? (
                                    <span className="flex items-center gap-2 justify-center">
                                        <span className="spinner w-4 h-4"></span>
                                        搜索中...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2 justify-center">
                                        <span>🔍</span>
                                        执行搜索
                                    </span>
                                )}
                            </button>

                            {onDownloadTemplate && onBatchSearch && (
                                <button
                                    type="button"
                                    onClick={openBatchModal}
                                    disabled={isSearching || isExporting || isBatchSearching}
                                    className="btn-batch flex items-center gap-2 px-4 py-2 text-sm w-full sm:w-auto min-w-[120px] justify-center"
                                >
                                    {isBatchSearching ? (
                                        <span className="flex items-center gap-2">
                                            <span className="spinner w-4 h-4 border-white/30 border-t-white"></span>
                                            {batchProgress || '查询中...'}
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-2">
                                            <span>⚡</span>
                                            批量查询
                                        </span>
                                    )}
                                </button>
                            )}

                            {onExport && (
                                <button
                                    type="button"
                                    onClick={handleExport}
                                    disabled={isSearching || isExporting}
                                    className="btn-export flex items-center gap-2 px-4 py-2 text-sm w-full sm:w-auto min-w-[120px] justify-center"
                                >
                                    {isExporting ? (
                                        <span className="flex items-center gap-2">
                                            <span className="spinner w-4 h-4 border-white/30 border-t-white"></span>
                                            导出中...
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-2">
                                            <span>📤</span>
                                            批量导出
                                        </span>
                                    )}
                                </button>
                            )}
                        </div>
                    </form>
                </div >
            )}
            
            {/* 批量查询弹窗 */}
            {isBatchModalOpen && createPortal(
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl p-6 w-full max-w-md space-y-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <span>⚡</span>
                                批量查询
                            </h3>
                            <button
                                onClick={() => setIsBatchModalOpen(false)}
                                className="text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors p-1"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-4">
                            <p className="text-sm text-[var(--text-muted)]">
                                1. 请先根据当前选中的表格和列下载查询模板。<br />
                                2. 在模板的相应 Sheet 中填写查询条件。<br />
                                3. 上传填写好的 Excel 文件进行批量查询。
                            </p>

                            <div className="flex flex-col gap-3">
                                {/* 查询模式设置 */}
                                <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--hover-bg)] border border-[var(--border)]">
                                    <span className="text-sm font-medium text-[var(--foreground)]">查询模式：</span>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setBatchMatchMode('exact')}
                                            className={`px-3 py-1.5 text-sm rounded-md transition-all ${batchMatchMode === 'exact'
                                                ? 'bg-[#667eea] text-white font-medium'
                                                : 'bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--foreground)] border border-[var(--border)]'
                                                }`}
                                        >
                                            精确查询
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setBatchMatchMode('fuzzy')}
                                            className={`px-3 py-1.5 text-sm rounded-md transition-all ${batchMatchMode === 'fuzzy'
                                                ? 'bg-[#667eea] text-white font-medium'
                                                : 'bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--foreground)] border border-[var(--border)]'
                                                }`}
                                        >
                                            模糊查询
                                        </button>
                                    </div>
                                </div>

                                {/* 批次数量设置 */}
                                <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--hover-bg)] border border-[var(--border)]">
                                    <span className="text-sm font-medium text-[var(--foreground)]" title="每次向WPS发送查询请求包含的行数">每次处理行数：</span>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="range"
                                            min="1"
                                            max="100"
                                            value={batchSize}
                                            onChange={(e) => setBatchSize(Number(e.target.value))}
                                            className="w-24 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#667eea]"
                                        />
                                        <input
                                            type="number"
                                            min="1"
                                            max="100"
                                            value={batchSize}
                                            onChange={(e) => {
                                                const val = Math.max(1, Math.min(100, Number(e.target.value)))
                                                setBatchSize(val)
                                            }}
                                            className="w-14 px-2 py-1 text-sm border border-[var(--border)] rounded bg-[var(--card-bg)] text-center"
                                        />
                                    </div>
                                </div>

                                {/* 单项最大返回数设置 */}
                                <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--hover-bg)] border border-[var(--border)]">
                                    <span className="text-sm font-medium text-[var(--foreground)]" title="批量查询时每个数据项最大返回的结果行数">单项最大返回数：</span>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="range"
                                            min="1"
                                            max="200"
                                            value={batchLimit}
                                            onChange={(e) => setBatchLimit(Number(e.target.value))}
                                            className="w-24 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#667eea]"
                                        />
                                        <input
                                            type="number"
                                            min="1"
                                            max="500"
                                            value={batchLimit}
                                            onChange={(e) => {
                                                const val = Math.max(1, Math.min(500, Number(e.target.value)))
                                                setBatchLimit(val)
                                            }}
                                            className="w-14 px-2 py-1 text-sm border border-[var(--border)] rounded bg-[var(--card-bg)] text-center"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <button
                                    type="button"
                                    onClick={onDownloadTemplate}
                                    className="flex flex-col items-center justify-center gap-2 p-3 rounded-lg bg-[#3b82f6]/10 hover:bg-[#3b82f6]/20 border border-[#3b82f6]/20 transition-all group"
                                >
                                    <span className="text-2xl group-hover:scale-110 transition-transform">⬇️</span>
                                    <span className="font-medium text-sm text-[#3b82f6]">下载模板</span>
                                </button>

                                {onPasteSearch && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const activeTables = Object.keys(selectedColumns).filter(key => selectedColumns[key] && selectedColumns[key].length > 0)
                                            if (activeTables.length > 0) {
                                                setPasteModalTableKey(activeTables[0])
                                                setIsBatchModalOpen(false)
                                            }
                                        }}
                                        className="flex flex-col items-center justify-center gap-2 p-3 rounded-lg bg-[#10b981]/10 hover:bg-[#10b981]/20 border border-[#10b981]/20 transition-all group"
                                    >
                                        <span className="text-2xl group-hover:scale-110 transition-transform">📋</span>
                                        <span className="font-medium text-sm text-[#10b981]">粘贴列查询</span>
                                    </button>
                                )}

                                <label className="flex flex-col items-center justify-center gap-2 p-3 rounded-lg bg-[#8b5cf6]/10 hover:bg-[#8b5cf6]/20 border border-[#8b5cf6]/20 transition-all cursor-pointer group">
                                    <span className="text-2xl group-hover:scale-110 transition-transform">📂</span>
                                    <span className="font-medium text-sm text-[#8b5cf6]">上传查询</span>
                                    <input
                                        type="file"
                                        accept=".xlsx,.xls"
                                        className="hidden"
                                        onChange={handleFileChange}
                                    />
                                </label>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* 粘贴查询弹窗 */}
            {pasteModalTableKey && onPasteSearch && (
                <PasteQueryModal
                    isOpen={true}
                    onClose={() => setPasteModalTableKey(null)}
                    tableKey={pasteModalTableKey}
                    columns={selectedColumns[pasteModalTableKey] || []}
                    onSearch={(data, matchMode, size, limit) => {
                        onPasteSearch(pasteModalTableKey, data, matchMode, size, limit)
                        setPasteModalTableKey(null)
                    }}
                    isSearching={isBatchSearching}
                    batchProgress={batchProgress}
                    initialData={pasteData[pasteModalTableKey]}
                    onDataChange={handlePasteDataChange}
                />
            )}
        </div >
    )
}
