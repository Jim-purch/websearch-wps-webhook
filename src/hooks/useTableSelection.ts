'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

export interface CellPosition {
    row: number
    col: number
}

export interface SelectionRange {
    start: CellPosition
    end: CellPosition
}

export interface UseTableSelectionOptions {
    onCopy?: (text: string) => void
}

export interface UseTableSelectionReturn {
    // 选择状态
    selection: SelectionRange | null
    isSelecting: boolean
    // 事件处理器
    handleMouseDown: (row: number, col: number, e: React.MouseEvent) => void
    handleMouseEnter: (row: number, col: number) => void
    handleMouseUp: () => void
    // 判断单元格是否被选中
    isCellSelected: (row: number, col: number) => boolean
    // 清除选择
    clearSelection: () => void
    // 复制选中的数据
    copySelection: (getData: (row: number, col: number) => string) => void
    // 绑定到容器的 props
    containerProps: {
        onMouseUp: () => void
        onMouseLeave: () => void
    }
}

/**
 * 表格单元格选择 Hook
 * 支持鼠标拖拽选择多个单元格，并以表格形式复制
 */
export function useTableSelection(options: UseTableSelectionOptions = {}): UseTableSelectionReturn {
    const { onCopy } = options

    const [selection, setSelection] = useState<SelectionRange | null>(null)
    const [isSelecting, setIsSelecting] = useState(false)
    const selectionStartRef = useRef<CellPosition | null>(null)

    // 开始选择
    const handleMouseDown = useCallback((row: number, col: number, e: React.MouseEvent) => {
        // 只响应左键
        if (e.button !== 0) return

        // 如果点击的是 input 或 textarea，不阻止默认行为（允许聚焦和粘贴）
        const target = e.target as HTMLElement
        const isInputElement = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

        if (!isInputElement) {
            // 阻止默认选择行为（仅对非输入元素）
            e.preventDefault()
        }

        selectionStartRef.current = { row, col }
        setSelection({ start: { row, col }, end: { row, col } })
        setIsSelecting(true)
    }, [])

    // 扩展选择
    const handleMouseEnter = useCallback((row: number, col: number) => {
        if (!isSelecting || !selectionStartRef.current) return

        setSelection({
            start: selectionStartRef.current,
            end: { row, col }
        })
    }, [isSelecting])

    // 结束选择
    const handleMouseUp = useCallback(() => {
        setIsSelecting(false)
    }, [])

    // 判断单元格是否在选中范围内
    const isCellSelected = useCallback((row: number, col: number): boolean => {
        if (!selection) return false

        const minRow = Math.min(selection.start.row, selection.end.row)
        const maxRow = Math.max(selection.start.row, selection.end.row)
        const minCol = Math.min(selection.start.col, selection.end.col)
        const maxCol = Math.max(selection.start.col, selection.end.col)

        return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol
    }, [selection])

    // 清除选择
    const clearSelection = useCallback(() => {
        setSelection(null)
        selectionStartRef.current = null
    }, [])

    // 复制选中的数据
    const copySelection = useCallback((getData: (row: number, col: number) => string) => {
        if (!selection) return

        const minRow = Math.min(selection.start.row, selection.end.row)
        const maxRow = Math.max(selection.start.row, selection.end.row)
        const minCol = Math.min(selection.start.col, selection.end.col)
        const maxCol = Math.max(selection.start.col, selection.end.col)

        const lines: string[] = []
        for (let r = minRow; r <= maxRow; r++) {
            const cells: string[] = []
            for (let c = minCol; c <= maxCol; c++) {
                cells.push(getData(r, c))
            }
            lines.push(cells.join('\t'))
        }

        const text = lines.join('\n')

        // 复制到剪贴板
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                onCopy?.(text)
            }).catch(() => {
                fallbackCopy(text)
            })
        } else {
            fallbackCopy(text)
        }
    }, [selection, onCopy])

    // 备用复制方法
    const fallbackCopy = useCallback((text: string) => {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        try {
            document.execCommand('copy')
            onCopy?.(text)
        } catch {
            console.error('复制失败')
        }
        document.body.removeChild(ta)
    }, [onCopy])

    // 键盘事件监听 (Ctrl+C / Cmd+C)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selection) {
                // 如果有自定义的复制处理，阻止默认行为
                // 注意：实际复制需要在组件中调用 copySelection
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [selection])

    // 跟踪是否刚完成拖拽选择（用于防止 click 事件清除选择）
    const justFinishedSelectingRef = useRef(false)

    // 结束选择时设置标记
    useEffect(() => {
        if (!isSelecting && selection) {
            // 刚完成选择，设置标记
            justFinishedSelectingRef.current = true
            // 300ms 后重置标记（允许在此期间不响应 click 清除）
            const timer = setTimeout(() => {
                justFinishedSelectingRef.current = false
            }, 300)
            return () => clearTimeout(timer)
        }
    }, [isSelecting, selection])

    // 点击其他地方清除选择
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement
            // 如果点击的不是表格单元格，清除选择
            if (!target.closest('[data-selectable-cell]')) {
                // 如果正在选择或刚完成选择，不清除
                if (isSelecting || justFinishedSelectingRef.current) {
                    return
                }
                clearSelection()
            }
        }

        document.addEventListener('click', handleClick)
        return () => document.removeEventListener('click', handleClick)
    }, [clearSelection, isSelecting])

    const containerProps = {
        onMouseUp: handleMouseUp,
        onMouseLeave: handleMouseUp
    }

    return {
        selection,
        isSelecting,
        handleMouseDown,
        handleMouseEnter,
        handleMouseUp,
        isCellSelected,
        clearSelection,
        copySelection,
        containerProps
    }
}
