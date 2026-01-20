import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

        // 从数据库获取 Token 信息
        const { data: token, error: tokenError } = await supabase
            .from('tokens')
            .select('webhook_url, token_value')
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
