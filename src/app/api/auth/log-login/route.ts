import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { WpsLogger } from '@/lib/wps-logger'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user }, error } = await supabase.auth.getUser()

        if (error || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 获取请求信息
        const body = await request.json().catch(() => ({}))
        const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
        const userAgent = request.headers.get('user-agent') || 'unknown'

        // 记录到 WPS
        await WpsLogger.log('login', {
            '用户名': user.user_metadata?.display_name || '未设置',
            '邮箱': user.email || '未知',
            '操作时间': new Date().toLocaleString('zh-CN'),
            '操作行为': '登录',
            '对应的记录值': `IP: ${ip}, UA: ${userAgent}`
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Login log error:', error)
        return NextResponse.json({ error: 'Failed to log' }, { status: 500 })
    }
}
