import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { WpsQueueManager } from '@/lib/wps/queue'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ success: false, error: '未授权' }, { status: 401 })
        }

        const body = await request.json()
        const { queries } = body // Array<{ tokenId: string, tableName: string }>

        if (!queries || !Array.isArray(queries)) {
            return NextResponse.json({ success: false, error: '参数错误' }, { status: 400 })
        }

        const adminSupabase = createSupabaseClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const statusMap: Record<string, { isIdle: boolean; activeCount: number; isGoogleSheets: boolean }> = {}

        for (const query of queries) {
            const { tokenId, tableName } = query
            let webhookUrl: string | null = null

            if (tokenId.startsWith('preset::')) {
                const presetId = tokenId.replace('preset::', '')
                const { data: presetData } = await supabase
                    .from('search_presets')
                    .select('token_id, columns_data')
                    .eq('id', presetId)
                    .single()

                if (presetData) {
                    let targetTokenId = presetData.token_id
                    const columnsData = (presetData.columns_data as Record<string, unknown>) || {}
                    const matchedKey = Object.keys(columnsData).find(key => {
                        const name = extractTableName(key)
                        return name === tableName
                    })
                    if (matchedKey) {
                        if (matchedKey.includes('::')) {
                            if (!matchedKey.startsWith('preset::')) {
                                const index = matchedKey.indexOf('::')
                                targetTokenId = matchedKey.slice(0, index)
                            }
                        }
                    }

                    const { data: tokenData } = await adminSupabase
                        .from('tokens')
                        .select('webhook_url')
                        .eq('id', targetTokenId)
                        .single()
                    webhookUrl = tokenData?.webhook_url || null
                }
            } else {
                const { data: tokenData } = await supabase
                    .from('tokens')
                    .select('webhook_url')
                    .eq('id', tokenId)
                    .single()
                webhookUrl = tokenData?.webhook_url || null
            }

            if (!webhookUrl) {
                // 如果无 webhook url，以 tokenId 作为队列 key
                const queueKey = tokenId
                statusMap[queueKey] = { isIdle: true, activeCount: 0, isGoogleSheets: false }
                continue
            }

            const queueKey = crypto.createHash('sha256').update(webhookUrl).digest('hex')
            
            // 避免重复检测
            if (queueKey in statusMap) continue

            const isGoogleSheets = webhookUrl.startsWith('gsheet://')
            if (isGoogleSheets) {
                statusMap[queueKey] = { isIdle: true, activeCount: 0, isGoogleSheets: true }
            } else {
                const activeCount = WpsQueueManager.getActiveCount(webhookUrl)
                statusMap[queueKey] = {
                    isIdle: activeCount === 0,
                    activeCount,
                    isGoogleSheets: false
                }
            }
        }

        return NextResponse.json({ success: true, status: statusMap })
    } catch (err) {
        console.error('Queue Status Error:', err)
        return NextResponse.json({ success: false, error: '获取队列状态失败' }, { status: 500 })
    }
}

/**
 * 从不同前缀格式的表主键中提取纯净的表名 (如: preset::[id]::Sheet1 或 token-123::Sheet1 -> Sheet1)
 */
function extractTableName(fullKey: string): string {
    if (fullKey.startsWith('token::')) {
        return '';
    }
    if (fullKey.startsWith('preset::')) {
        const remaining = fullKey.slice(8); // remove 'preset::'
        const index = remaining.indexOf('::');
        return index !== -1 ? remaining.slice(index + 2) : remaining;
    }
    if (fullKey.includes('::')) {
        const index = fullKey.indexOf('::');
        return fullKey.slice(index + 2);
    }
    return fullKey;
}
