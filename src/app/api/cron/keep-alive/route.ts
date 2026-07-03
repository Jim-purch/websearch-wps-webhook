import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
    // 验证 Vercel Cron 密钥 (安全验证)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    // 如果环境变量中配置了 CRON_SECRET，则进行严格的 Bearer Token 校验
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        if (!supabaseUrl || !supabaseAnonKey) {
            return NextResponse.json({ error: 'Supabase configurations are missing' }, { status: 500 })
        }

        // 使用轻量级的直接 client 进行查询，不涉及 Cookie 交互
        const supabase = createClient(supabaseUrl, supabaseAnonKey)

        // 对公共可见的 system_settings 表进行一次极轻量的 Select 操作以激活项目
        const { data, error } = await supabase
            .from('system_settings')
            .select('key')
            .limit(1)

        if (error) {
            console.error('Keep-alive DB select error:', error)
            return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            message: 'Database ping successful, Supabase project kept active.',
            data
        })
    } catch (err: any) {
        console.error('Keep-alive caught exception:', err)
        return NextResponse.json({ success: false, error: err.message }, { status: 500 })
    }
}
