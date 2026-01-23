import { createClient } from './supabase/server'

export interface WpsLoggerConfig {
    airScriptToken: string
    webhookUrl: string
    rowLimit: number
    enabled: boolean
}

interface LogData {
    sheetBaseName: string
    data: Record<string, any>
}

export class WpsLogger {
    private static async getConfig(): Promise<WpsLoggerConfig | null> {
        const supabase = await createClient()
        const { data, error } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'wps_logger_config')
            .single()

        if (error || !data) return null
        return data.value as WpsLoggerConfig
    }

    static async log(type: 'login' | 'search' | 'batch', data: Record<string, any>) {
        const config = await this.getConfig()
        if (!config || !config.enabled || !config.webhookUrl) return

        let sheetBaseName = ''
        switch (type) {
            case 'login':
                sheetBaseName = '登录记录'
                break
            case 'search':
                sheetBaseName = '搜索记录'
                break
            case 'batch':
                sheetBaseName = '批量搜索记录'
                break
        }

        const payload = {
            Context: {
                argv: {
                    action: "smartAppend", // We will implement this in AirScript
                    sheetBaseName: sheetBaseName,
                    rowLimit: config.rowLimit || 2000,
                    rowData: data
                }
            }
        }

        try {
            const response = await fetch(config.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'AirScript-Token': config.airScriptToken
                },
                body: JSON.stringify(payload)
            })

            if (!response.ok) {
                console.error('Failed to send log to WPS:', await response.text())
            }
        } catch (error) {
            console.error('Error sending log to WPS:', error)
        }
    }
}
