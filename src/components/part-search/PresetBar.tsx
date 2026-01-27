'use client'

import type { SearchPreset } from '@/types'
import { PresetButton } from './PresetButton'

interface PresetBarProps {
    presets: SearchPreset[]
    activePresetId: string | null
    isLoading: boolean
    onLoadPreset: (preset: SearchPreset) => void
    onEditPreset: (preset: SearchPreset) => void
    onDeletePreset: (presetId: string) => void
}

export function PresetBar({
    presets,
    activePresetId,
    isLoading,
    onLoadPreset,
    onEditPreset,
    onDeletePreset
}: PresetBarProps) {
    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <span className="spinner w-4 h-4"></span>
                加载预设中...
            </div>
        )
    }

    if (presets.length === 0) {
        return null
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-[var(--text-muted)] mr-1">预设：</span>
            {presets.map((preset) => (
                <PresetButton
                    key={preset.id}
                    preset={preset}
                    isActive={preset.id === activePresetId}
                    onLoad={() => onLoadPreset(preset)}
                    onEdit={() => onEditPreset(preset)}
                    onDelete={() => onDeletePreset(preset.id)}
                />
            ))}
        </div>
    )
}
