'use client'

import type { Token } from '@/types'

interface TokenSelectorProps {
    tokens: Token[]
    selectedToken: Token | null
    isLoading: boolean
    onSelect: (tokenId: string) => void
}

export function TokenSelector({ tokens, selectedToken, isLoading, onSelect }: TokenSelectorProps) {
    return (
        <div className="card p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="text-xl">🔑</span>
                步骤 1: 选择 Token
            </h3>
            <select
                className="input"
                value={selectedToken?.id || ''}
                onChange={(e) => onSelect(e.target.value)}
                disabled={isLoading}
            >
                <option value="">-- 请选择一个 Token --</option>
                {tokens.map((token) => (
                    <option key={token.id} value={token.id}>
                        {token.name}
                        {token.description ? ` (${token.description})` : ''}
                    </option>
                ))}
            </select>
            {tokens.length === 0 && !isLoading && (
                <p className="text-sm text-[var(--text-muted)] mt-2">
                    没有可用的 Token。请先在「管理 Token」中添加带有 Webhook URL 的 Token。
                </p>
            )}
        </div>
    )
}
