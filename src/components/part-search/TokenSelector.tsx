'use client'

import { useState } from 'react'
import type { Token } from '@/types'

// 扩展Token类型以支持分享信息
type TokenWithShareInfo = Token & {
    _isShared?: boolean
    _sharerEmail?: string
}

interface TokenSelectorProps {
    tokens: TokenWithShareInfo[]
    selectedToken: TokenWithShareInfo | null
    isLoading: boolean
    onSelect: (tokenId: string) => void
}

export function TokenSelector({ tokens, selectedToken, isLoading, onSelect }: TokenSelectorProps) {
    const [isOpen, setIsOpen] = useState(true)

    return (
        <div className="card">
            <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <span className="text-xl">🔑</span>
                    步骤 1: 选择 Token
                    {!isOpen && selectedToken && (
                        <span className="text-sm font-normal text-[var(--text-muted)] ml-2">
                            - 已选: {selectedToken.name}
                        </span>
                    )}
                </h3>
                <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                    ▼
                </span>
            </div>

            {isOpen && (
                <div className="p-6 pt-0 border-t border-transparent">
                    <select
                        className="input"
                        value={selectedToken?.id || ''}
                        onChange={(e) => onSelect(e.target.value)}
                        disabled={isLoading}
                    >
                        <option value="">-- 请选择一个 Token --</option>
                        {tokens.map((token) => (
                            <option key={token.id} value={token.id}>
                                {token._isShared ? '📥 ' : '🔑 '}
                                {token.name}
                                {token._isShared && token._sharerEmail && ` (来自 ${token._sharerEmail})`}
                                {!token._isShared && token.description ? ` (${token.description})` : ''}
                            </option>
                        ))}
                    </select>
                    {tokens.length === 0 && !isLoading && (
                        <p className="text-sm text-[var(--text-muted)] mt-2">
                            没有可用的 Token。请先在「管理 Token」中添加带有 Webhook URL 的 Token，或在「分享管理」中添加他人分享的 Token。
                        </p>
                    )}
                    {selectedToken?._isShared && (
                        <p className="text-sm text-blue-600 mt-2">
                            📥 这是他人分享给您的 Token
                            {selectedToken._sharerEmail && `，来自 ${selectedToken._sharerEmail}`}
                        </p>
                    )}
                </div>
            )}
        </div>
    )
}

