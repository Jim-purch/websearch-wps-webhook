import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
    try {
        const supabase = await createClient()
        // system_settings 表对所有人可读 (或至少对登录用户可读)
        const { data, error } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'wps_logger_config')
            .single()

        if (error && error.code !== 'PGRST116') { // PGRST116 is 'not found'
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json(data?.value || null)
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 检查是否为管理员
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if (!profile || profile.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const body = await request.json()

        // 验证 Webhook URL 格式 (简单验证)
        if (body.webhookUrl && !body.webhookUrl.startsWith('http')) {
            return NextResponse.json({ error: 'Invalid Webhook URL' }, { status: 400 })
        }

        // 保存配置 (依赖 RLS Policies: Admins can manage system settings)
        const { error } = await supabase
            .from('system_settings')
            .upsert({
                key: 'wps_logger_config',
                value: body,
                updated_by: user.id,
                updated_at: new Date().toISOString()
            })

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 })
    }
}
