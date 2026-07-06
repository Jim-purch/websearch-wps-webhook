'use client'

import { useState, useRef, useEffect } from 'react'
import type { SearchPreset } from '@/types'

interface PresetButtonProps {
    preset: SearchPreset
    isActive: boolean
    onLoad: () => void
    onEdit: () => void
    onDelete: () => void
    isOwner?: boolean
}

export function PresetButton({
    preset,
    isActive,
    onLoad,
    onEdit,
    onDelete,
    isOwner
}: PresetButtonProps) {
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // 点击外部关闭菜单
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
                setIsMenuOpen(false)
            }
        }

        if (isMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isMenuOpen])

    const handleDelete = () => {
        if (confirm(`确定要删除预设 "${preset.name}" 吗？`)) {
            onDelete()
        }
        setIsMenuOpen(false)
    }

    const handleButtonClick = () => {
        onLoad()
    }

    const handleMenuClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        setIsMenuOpen(!isMenuOpen)
    }

    return (
        <div ref={containerRef} className="relative inline-flex">
            {/* 预设按钮（包含三点菜单） */}
            <button
                onClick={handleButtonClick}
                className={`
                    px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                    flex items-center gap-1.5
                    ${isActive
                        ? 'bg-gradient-to-r from-[#10b981] to-[#34d399] text-white shadow-md'
                        : 'bg-[var(--hover-bg)] text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] border border-[var(--border)]'
                    }
                `}
            >
                <span className="text-xs">📋</span>
                <span className="max-w-[100px] truncate">{preset.name}</span>
                {/* 三点菜单在按钮内部 */}
                {isOwner !== false && (
                    <span
                        onClick={handleMenuClick}
                        className={`
                            ml-1 px-1 rounded transition-colors cursor-pointer
                            ${isActive
                                ? 'hover:bg-white/20'
                                : 'hover:bg-[var(--border)]'
                            }
                        `}
                        title="更多操作"
                    >
                        ⋮
                    </span>
                )}
            </button>

            {/* 下拉菜单 */}
            {isMenuOpen && (
                <div
                    ref={menuRef}
                    className="absolute top-full right-0 mt-1 py-1 min-w-[100px] bg-[var(--card-bg)] border border-[var(--border)] rounded-lg shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                >
                    <button
                        onClick={() => {
                            onEdit()
                            setIsMenuOpen(false)
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--hover-bg)] transition-colors flex items-center gap-2"
                    >
                        <span>✏️</span>
                        编辑名称
                    </button>
                    <button
                        onClick={handleDelete}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-red-500/10 text-red-500 transition-colors flex items-center gap-2"
                    >
                        <span>🗑️</span>
                        删除
                    </button>
                </div>
            )}
        </div>
    )
}
