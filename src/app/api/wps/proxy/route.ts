import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { WpsLogger } from '@/lib/wps-logger'

/**
 * WPS Webhook 代理 API
 * 解决浏览器 CORS 限制问题
 */
export async function POST(request: NextRequest) {
    try {
        // 验证用户身份
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: '未授权' },
                { status: 401 }
            )
        }

        const body = await request.json()
        const { tokenId, argv } = body

        if (!tokenId || !argv) {
            return NextResponse.json(
                { success: false, error: '缺少必要参数' },
                { status: 400 }
            )
        }

        // 从数据库获取 Token 信息 (提前获取以用于日志)
        const { data: token, error: tokenError } = await supabase
            .from('tokens')
            .select('name, webhook_url, token_value')
            .eq('id', tokenId)
            .single()

        if (tokenError || !token) {
            return NextResponse.json(
                { success: false, error: 'Token 不存在' },
                { status: 404 }
            )
        }

        if (!token.webhook_url) {
            return NextResponse.json(
                { success: false, error: 'Token 没有配置 Webhook URL' },
                { status: 400 }
            )
        }

        // ==========================================
        // 日志记录逻辑 (不阻塞主线程失败，但需等待完成以保证Serverless环境执行)
        // ==========================================
        try {
            const action = argv.action
            const userName = user.user_metadata?.display_name || '未设置'
            const userEmail = user.email || '未知'
            const timeStr = new Date().toLocaleString('zh-CN')
            const tokenName = token.name || '未命名Token'

            if (action === 'searchMulti') {
                const criteria = argv.criteria || []
                let criteriaStr = ''
                let fieldsStr = ''
                let valuesStr = ''

                if (Array.isArray(criteria)) {
                    criteriaStr = criteria.map((c: any) => `${c.columnName} ${c.op} ${c.searchValue}`).join('; ')
                    fieldsStr = criteria.map((c: any) => c.columnName).join(', ')
                    valuesStr = criteria.map((c: any) => c.searchValue).join(', ')
                }

                await WpsLogger.log('search', {
                    '用户名': userName,
                    '邮箱': userEmail,
                    '操作时间': timeStr,
                    '使用token名称': tokenName,
                    '选择数据表': argv.sheetName,
                    '选择字段名称': fieldsStr,
                    '搜索值': valuesStr,
                    '对应的记录值': `Sheet: ${argv.sheetName}, 查询: ${criteriaStr}`
                })
            } else if (action === 'searchBatch') {
                const batchCriteria = argv.batchCriteria || []
                const count = Array.isArray(batchCriteria) ? batchCriteria.length : 0

                // 提取字段名和搜索值摘要
                let fieldsStr = ''
                let valuesStr = ''
                if (count > 0 && batchCriteria[0].criteria) {
                    fieldsStr = batchCriteria[0].criteria.map((c: any) => c.columnName).join(', ')
                    // 收集所有搜索值
                    const allValues = batchCriteria.map((item: any) => {
                        return item.criteria ? item.criteria.map((c: any) => c.searchValue).join('&') : ''
                    }).filter((v: string) => v)
                    valuesStr = allValues.join(', ')
                    if (valuesStr.length > 500) valuesStr = valuesStr.substring(0, 500) + '...'
                }

                await WpsLogger.log('batch', {
                    '用户名': userName,
                    '邮箱': userEmail,
                    '操作时间': timeStr,
                    '使用token名称': tokenName,
                    '选择数据表': argv.sheetName,
                    '选择字段名称': fieldsStr,
                    '搜索值': valuesStr,
                    '对应的记录值': `Sheet: ${argv.sheetName}, 批量查询数量: ${count}`
                })
            }
        } catch (logErr) {
            console.error('WPS Search Log Error:', logErr)
            // 日志失败不影响主流程
        }
        // ==========================================



        // 代理请求到 WPS
        const wpsResponse = await fetch(token.webhook_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'AirScript-Token': token.token_value
            },
            body: JSON.stringify({
                Context: { argv }
            })
        })

        if (!wpsResponse.ok) {
            return NextResponse.json(
                {
                    success: false,
                    error: `WPS API 错误: ${wpsResponse.status} ${wpsResponse.statusText}`
                },
                { status: wpsResponse.status }
            )
        }

        const wpsData = await wpsResponse.json()
        return NextResponse.json(wpsData)

    } catch (err) {
        console.error('WPS Proxy Error:', err)
        return NextResponse.json(
            {
                success: false,
                error: err instanceof Error ? err.message : '代理请求失败'
            },
            { status: 500 }
        )
    }
}

