import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // 刷新会话
    const {
        data: { user },
    } = await supabase.auth.getUser()

    const pathname = request.nextUrl.pathname

    // 公开路由，无需认证
    const publicRoutes = ['/', '/login', '/register', '/auth/callback', '/shares']
    const isPublicRoute = publicRoutes.some(route => pathname === route || pathname.startsWith('/shares/'))

    // 如果用户未登录且访问受保护路由
    if (!user && !isPublicRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // 如果用户已登录，检查激活状态（除了特定页面）
    if (user && !isPublicRoute && pathname !== '/inactive') {
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('is_active, role')
            .eq('id', user.id)
            .single()

        // 如果用户未激活，重定向到未激活页面
        if (profile && !profile.is_active) {
            const url = request.nextUrl.clone()
            url.pathname = '/inactive'
            return NextResponse.redirect(url)
        }

        // 如果访问管理员路由但不是管理员
        if (pathname.startsWith('/admin') && profile?.role !== 'admin') {
            const url = request.nextUrl.clone()
            url.pathname = '/dashboard'
            return NextResponse.redirect(url)
        }
    }

    // 如果用户已登录且访问登录/注册页面，重定向到仪表板
    if (user && (pathname === '/login' || pathname === '/register')) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}
