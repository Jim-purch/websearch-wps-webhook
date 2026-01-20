import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    const supabase = await createClient()

    // 1. 验证用户登录
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. 验证管理员权限
    const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    try {
        const body = await request.json()
        const { email, password, displayName, role, isActive } = body

        if (!email || !password) {
            return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
        }

        const adminClient = createAdminClient()

        // 3. 创建用户
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                display_name: displayName
            }
        })

        if (createError) throw createError
        if (!newUser.user) throw new Error('Failed to create user')

        // 4. 更新用户资料（角色和状态）
        // 注意：Trigger 会自动创建 profile，但我们需要更新它
        const updates: any = {
            updated_at: new Date().toISOString()
        }
        if (role) updates.role = role
        if (isActive !== undefined) updates.is_active = isActive

        if (Object.keys(updates).length > 0) {
            const { error: updateError } = await adminClient
                .from('user_profiles')
                .update(updates)
                .eq('id', newUser.user.id)

            if (updateError) throw updateError
        }

        return NextResponse.json({ success: true, user: newUser.user })

    } catch (error: any) {
        console.error('Create user error:', error)
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
    }
}
