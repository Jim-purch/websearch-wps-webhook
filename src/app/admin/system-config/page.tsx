'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface WpsLoggerConfig {
    airScriptToken: string
    webhookUrl: string
    rowLimit: number
    enabled: boolean
}

export default function SystemConfigPage() {
    const [config, setConfig] = useState<WpsLoggerConfig>({
        airScriptToken: '',
        webhookUrl: '',
        rowLimit: 2000,
        enabled: false
    })
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await fetch('/api/admin/wps-logger-config')
                if (!res.ok) throw new Error('Failed to fetch config')
                const data = await res.json()
                if (data) {
                    setConfig(prev => ({
                        ...prev,
                        ...data,
                        webhookUrl: data.webhookUrl || ''
                    }))
                }
            } catch (error) {
                console.error('Error fetching config:', error)
            } finally {
                setIsLoading(false)
            }
        }
        fetchConfig()
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSaving(true)
        setMessage(null)

        try {
            const res = await fetch('/api/admin/wps-logger-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            })

            if (!res.ok) {
                const errData = await res.json()
                throw new Error(errData.error || 'Failed to save config')
            }

            setMessage({ type: 'success', text: '配置已保存' })
        } catch (error) {
            setMessage({ type: 'error', text: String(error) })
        } finally {
            setIsSaving(false)
        }
    }

    if (isLoading) {
        return <div className="p-8 text-center">加载中...</div>
    }

    return (
        <div className="max-w-7xl mx-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold mb-2">系统配置</h1>
                <p className="text-[var(--text-muted)]">管理系统级配置和集成</p>
            </div>

            <div className="card p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        📑 WPS 智能表格日志
                    </h2>
                    <div className="flex items-center gap-2">
                        <label className="switch">
                            <input
                                type="checkbox"
                                checked={config.enabled}
                                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                            <span className="ml-3 text-sm font-medium">
                                {config.enabled ? '已启用' : '已禁用'}
                            </span>
                        </label>
                    </div>
                </div>

                <p className="mb-6 text-sm text-[var(--text-muted)]">
                    启用后，系统登录记录、搜索记录将自动写入指定的 WPS 智能表格。
                    请确保已在 WPS AirScript 中部署了对应的脚本。
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Webhook URL</label>
                        <input
                            type="text"
                            value={config.webhookUrl}
                            onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
                            className="w-full rounded-lg border border-[var(--border)] p-2 bg-[var(--bg-secondary)]"
                            placeholder="https://www.kdocs.cn/api/v3/ide/file/..."
                            required={config.enabled}
                        />
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                            请填写 AirScript 发布的 Webhook 完整地址
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">AirScript Token</label>
                        <input
                            type="password"
                            value={config.airScriptToken}
                            onChange={(e) => setConfig({ ...config, airScriptToken: e.target.value })}
                            className="w-full rounded-lg border border-[var(--border)] p-2 bg-[var(--bg-secondary)]"
                            placeholder="输入 API Token"
                            required={config.enabled}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">单表行数限制</label>
                        <input
                            type="number"
                            value={config.rowLimit}
                            onChange={(e) => setConfig({ ...config, rowLimit: parseInt(e.target.value) || 2000 })}
                            className="w-full rounded-lg border border-[var(--border)] p-2 bg-[var(--bg-secondary)] max-w-[200px]"
                            min="100"
                            max="1000000"
                        />
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                            当记录数超过此限制时，会自动创建新工作表（如：登录记录-2）
                        </p>
                    </div>

                    <div className="pt-4 border-t border-[var(--border)] flex justify-end">
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="btn btn-primary px-6 py-2 rounded-lg gradient-primary text-white disabled:opacity-50"
                        >
                            {isSaving ? '保存中...' : '保存配置'}
                        </button>
                    </div>

                    {message && (
                        <div className={`p-4 rounded-lg flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {message.type === 'success' ? '✅' : '❌'} {message.text}
                        </div>
                    )}
                </form>
            </div>
        </div>
    )
}
