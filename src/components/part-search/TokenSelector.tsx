'use client'

import { useState, useEffect } from 'react'
import type { Token } from '@/types'

// 扩展Token类型以支持分享信息
type TokenWithShareInfo = Token & {
    _isShared?: boolean
    _sharerEmail?: string
}

interface TokenSelectorProps {
    tokens: TokenWithShareInfo[]
    selectedTokens: TokenWithShareInfo[]
    isLoading: boolean
    onToggle: (tokenId: string) => void
    onSelectAll: () => void
    onDeselectAll: () => void
    forceCollapsed?: number // 收起计数器，每次变化时强制收起
}

export function TokenSelector({
    tokens,
    selectedTokens,
    isLoading,
    onToggle,
    onSelectAll,
    onDeselectAll,
    forceCollapsed
}: TokenSelectorProps) {
    const [isOpen, setIsOpen] = useState(true)

    // 当外部要求折叠时
    useEffect(() => {
        if (forceCollapsed && forceCollapsed > 0) {
            setIsOpen(false)
        }
    }, [forceCollapsed])

    const selectedIds = new Set(selectedTokens.map(t => t.id))

    return (
        <div className="card">
            <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <span className="text-xl">🔑</span>
                    步骤 1: 选择 Token (多选)
                    {!isOpen && selectedTokens.length > 0 && (
                        <span className="text-sm font-normal text-[var(--text-muted)] ml-2">
                            - 已选: {selectedTokens.map(t => t.name).join(', ')}
                        </span>
                    )}
                </h3>
                <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                    ▼
                </span>
            </div>

            {isOpen && (
                <div className="p-6 pt-0 border-t border-transparent">
                    {isLoading ? (
                        <div className="flex justify-center py-4">
                            <div className="spinner"></div>
                        </div>
                    ) : tokens.length === 0 ? (
                        <p className="text-sm text-[var(--text-muted)] mt-2">
                            没有可用的 Token。请先在「管理 Token」中添加带有 Webhook URL 的 Token，或在「分享管理」中添加他人分享的 Token。
                        </p>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                                {tokens.map((token) => {
                                    const isSelected = selectedIds.has(token.id)
                                    const isGSheet = token.webhook_url?.startsWith('gsheet://')
                                    const typeIcon = token._isShared ? '📥' : (isGSheet ? '📗' : '🔑')
                                    const typeSuffix = isGSheet ? ' [Google Sheets]' : ''
                                    
                                    return (
                                        <button
                                            key={token.id}
                                            type="button"
                                            onClick={() => onToggle(token.id)}
                                            className={`
                                                flex items-start text-left gap-3 p-3 rounded-lg border text-sm transition-all
                                                ${isSelected
                                                    ? 'border-[#eab308] bg-[rgba(234,179,8,0.1)] text-[var(--foreground)] shadow-sm'
                                                    : 'border-[var(--border)] hover:border-[#667eea] hover:bg-[var(--hover-bg)]'
                                                }
                                            `}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                readOnly
                                                className="accent-[#eab308] mt-0.5 pointer-events-none"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold truncate flex items-center gap-1.5">
                                                    <span>{typeIcon}</span>
                                                    <span className="truncate">{token.name}</span>
                                                </div>
                                                <div className="text-xs text-[var(--text-muted)] truncate mt-1">
                                                    {isGSheet ? 'Google Sheets' : 'WPS 表格'}
                                                    {token._isShared && token._sharerEmail && ` (来自 ${token._sharerEmail})`}
                                                    {!token._isShared && token.description && ` - ${token.description}`}
                                                </div>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={onSelectAll}
                                    className="btn-secondary text-xs py-1.5 px-3"
                                >
                                    全选
                                </button>
                                <button
                                    type="button"
                                    onClick={onDeselectAll}
                                    className="btn-secondary text-xs py-1.5 px-3"
                                >
                                    全不选
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
