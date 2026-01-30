'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Token } from '@/types'

interface MCPConfigDrawerProps {
    isOpen: boolean
    onClose: () => void
    tokens: Token[]
}

export function MCPConfigDrawer({ isOpen, onClose, tokens }: MCPConfigDrawerProps) {
    const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([])
    const [configJson, setConfigJson] = useState<string>('')
    const [mounted, setMounted] = useState(false)
    const [copySuccess, setCopySuccess] = useState(false)
    const [orderedActiveIds, setOrderedActiveIds] = useState<string[]>([])
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

    useEffect(() => {
        setMounted(true)
    }, [])

    // Sync ordered active IDs when tokens change
    useEffect(() => {
        const activeIds = tokens.filter(t => t.is_active).map(t => t.id)
        setOrderedActiveIds(prev => {
            // Keep existing order for IDs that are still active
            const existingActive = prev.filter(id => activeIds.includes(id))
            // Add new IDs that weren't in the list before
            const newActive = activeIds.filter(id => !prev.includes(id))
            return [...existingActive, ...newActive]
        })
    }, [tokens])

    // 当可见性改变时，默认选中所有活跃token
    useEffect(() => {
        if (isOpen && selectedTokenIds.length === 0) {
            const activeIds = tokens.filter(t => t.is_active).map(t => t.id)
            if (activeIds.length > 0) {
                setSelectedTokenIds(activeIds)
            }
        }
    }, [isOpen, tokens])

    // 生成 JSON
    useEffect(() => {
        const selectedTokens = orderedActiveIds
            .filter(id => selectedTokenIds.includes(id))
            .map(id => tokens.find(t => t.id === id))
            .filter((t): t is Token => !!t)

        const mcpConfig = {
            mcpServers: {
                wps: {
                    command: "npx",
                    args: ["-y", "jim-wps-mcp-server@latest"],
                    env: {
                        WPS_CONFIG: JSON.stringify(selectedTokens.map(t => ({
                            name: t.name,
                            description: t.description || "",
                            webhookUrl: t.webhook_url || "",
                            token: t.token_value
                        })))
                    }
                }
            }
        }

        setConfigJson(JSON.stringify(mcpConfig, null, 2))
    }, [selectedTokenIds, orderedActiveIds, tokens])

    const toggleToken = (id: string) => {
        setSelectedTokenIds(prev =>
            prev.includes(id)
                ? prev.filter(tId => tId !== id)
                : [...prev, id]
        )
    }

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIndex(index)
        e.dataTransfer.effectAllowed = 'move'
        // Add a ghost image or styling if desired
    }

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault()
        if (draggedIndex === null || draggedIndex === index) return
        setDragOverIndex(index)
    }

    const handleDrop = (e: React.DragEvent, index: number) => {
        e.preventDefault()
        if (draggedIndex === null || draggedIndex === index) {
            setDraggedIndex(null)
            setDragOverIndex(null)
            return
        }

        const newIds = [...orderedActiveIds]
        const draggedItem = newIds[draggedIndex]
        newIds.splice(draggedIndex, 1)
        newIds.splice(index, 0, draggedItem)

        setOrderedActiveIds(newIds)
        setDraggedIndex(null)
        setDragOverIndex(null)
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(configJson)
        setCopySuccess(true)
        setTimeout(() => setCopySuccess(false), 2000)
    }

    if (!mounted || !isOpen) return null

    return createPortal(
        <div className="fixed inset-0 z-[10000] flex justify-end">
            {/* Overlay */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            />

            {/* Drawer Panel */}
            <div className="relative w-full max-w-lg h-full bg-[var(--background)] shadow-2xl border-l border-[var(--border)] flex flex-col animate-in slide-in-from-right duration-300">
                <div className="p-6 border-bottom border-[var(--border)] flex items-center justify-between">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <span>🤖</span> MCP 配置生成
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-[var(--hover-bg)] rounded-full transition-colors"
                    >
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <section>
                        <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center justify-between">
                            1. 选择并排序 Token
                            <span className="text-[10px] lowercase font-normal opacity-60">拖动项目以调整顺序</span>
                        </h3>
                        <div className="space-y-2">
                            {orderedActiveIds.map((id, index) => {
                                const token = tokens.find(t => t.id === id)
                                if (!token) return null

                                const isSelected = selectedTokenIds.includes(token.id)
                                const isDragging = draggedIndex === index
                                const isDragOver = dragOverIndex === index

                                return (
                                    <div
                                        key={token.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, index)}
                                        onDragOver={(e) => handleDragOver(e, index)}
                                        onDrop={(e) => handleDrop(e, index)}
                                        onDragEnd={() => { setDraggedIndex(null); setDragOverIndex(null); }}
                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-grab active:cursor-grabbing ${isSelected
                                                ? 'border-[var(--primary)] bg-[var(--hover-bg)] shadow-sm'
                                                : 'border-[var(--border)] bg-[var(--bg-tertiary)]/50 opacity-60 hover:opacity-100 hover:border-[var(--text-muted)]'
                                            } ${isDragging ? 'opacity-20 border-dashed' : ''} ${isDragOver ? 'border-t-2 border-t-[var(--primary)] mt-1' : ''}`}
                                    >
                                        <div className="text-[var(--text-muted)] opacity-40 drag-handle">
                                            ⣿
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleToken(token.id)}
                                            className="w-5 h-5 accent-[var(--primary)] cursor-pointer"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <div className="flex-1 min-w-0" onClick={() => toggleToken(token.id)}>
                                            <div className="font-medium truncate">{token.name}</div>
                                            {token.description && (
                                                <div className="text-xs text-[var(--text-muted)] truncate">{token.description}</div>
                                            )}
                                        </div>

                                        {isSelected && (
                                            <div className="text-[10px] font-bold text-[var(--primary)] bg-[var(--primary)]/10 px-2 py-0.5 rounded">
                                                #{orderedActiveIds.filter(tid => selectedTokenIds.includes(tid)).indexOf(id) + 1}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                            {orderedActiveIds.length === 0 && (
                                <div className="text-center py-8 text-[var(--text-muted)]">
                                    没有活跃的 Token，请先在个人资料页启用 Token。
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="flex flex-col h-[400px]">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                                2. MCP JSON 配置
                            </h3>
                            <button
                                onClick={handleCopy}
                                className={`text-xs px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${copySuccess
                                    ? 'bg-green-500/20 text-green-500 border border-green-500/30'
                                    : 'bg-[var(--primary)] text-white hover:opacity-90'
                                    }`}
                            >
                                {copySuccess ? '✅ 已复制' : '📋 复制代码'}
                            </button>
                        </div>
                        <div className="flex-1 bg-black/30 rounded-xl border border-[var(--border)] overflow-hidden font-mono text-sm">
                            <textarea
                                readOnly
                                value={configJson}
                                className="w-full h-full p-4 bg-transparent outline-none resize-none text-gray-300"
                            />
                        </div>
                    </section>

                    <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl">
                        <h4 className="flex items-center gap-2 text-blue-400 font-medium text-sm mb-2">
                            <span>💡</span> 使用说明
                        </h4>
                        <ul className="text-xs text-blue-300/80 space-y-1.5 list-disc pl-4">
                            <li>复制上述 JSON 到您的 Claude Desktop 配置文件中 (claude_desktop_config.json)。</li>
                            <li>配置完成后，可以通过 <code className="text-blue-200">list_configs</code> 工具查看所有可用配置。</li>
                            <li>通过 <code className="text-blue-200">tokenName</code> 参数指定使用哪个配置（默认为第一个）。</li>
                        </ul>
                    </div>
                </div>

                <div className="p-6 border-t border-[var(--border)] bg-[var(--bg-tertiary)]/30">
                    <button
                        onClick={onClose}
                        className="w-full btn-secondary py-3 flex items-center justify-center gap-2"
                    >
                        关闭
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}
