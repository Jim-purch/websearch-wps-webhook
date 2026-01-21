'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { UserProfile, AuthState } from '@/types'
import type { User } from '@supabase/supabase-js'

export function useAuth() {
    const [authState, setAuthState] = useState<AuthState>({
        user: null,
        isLoading: true,
        isAuthenticated: false,
        isAdmin: false,
        isActive: false,
    })

    const supabase = useMemo(() => createClient(), [])

    const fetchUserProfile = useCallback(async (user: User | null) => {
        if (!user) {
            setAuthState({
                user: null,
                isLoading: false,
                isAuthenticated: false,
                isAdmin: false,
                isActive: false,
            })
            return
        }

        try {
            const { data: profile, error } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', user.id)
                .single()

            if (error) {
                console.error('Error fetching user profile:', error)
                // 如果无法获取 profile，使用 auth 用户的基本信息作为备用
                setAuthState({
                    user: {
                        id: user.id,
                        email: user.email || '',
                        display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || null,
                        role: 'user',
                        is_active: false,
                        created_at: user.created_at || new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    },
                    isLoading: false,
                    isAuthenticated: true,
                    isAdmin: false,
                    isActive: false,
                })
                return
            }

            setAuthState({
                user: profile as UserProfile,
                isLoading: false,
                isAuthenticated: true,
                isAdmin: profile.role === 'admin',
                isActive: profile.is_active,
            })
        } catch (err) {
            console.error('Unexpected error fetching user profile:', err)
            // 备用：使用 auth 用户信息
            setAuthState({
                user: {
                    id: user.id,
                    email: user.email || '',
                    display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || null,
                    role: 'user',
                    is_active: false,
                    created_at: user.created_at || new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                },
                isLoading: false,
                isAuthenticated: true,
                isAdmin: false,
                isActive: false,
            })
        }
    }, [supabase])

    useEffect(() => {
        // 获取初始会话
        supabase.auth.getUser().then(({ data: { user } }) => {
            fetchUserProfile(user)
        })

        // 监听认证状态变化
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                fetchUserProfile(session?.user ?? null)
            }
        )

        return () => {
            subscription.unsubscribe()
        }
    }, [supabase, fetchUserProfile])

    // 登录
    const signIn = async (email: string, password: string) => {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        // 登录成功后记录日志
        if (!error && data?.user) {
            try {
                await supabase.from('login_logs').insert({
                    user_id: data.user.id,
                    ip_address: null, // 客户端无法可靠获取 IP
                    user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : null,
                })
            } catch (logError) {
                console.error('Failed to log login:', logError)
            }
        }

        return { error }
    }

    // 注册
    const signUp = async (email: string, password: string, displayName?: string) => {
        // 获取当前域名作为邮件确认后的重定向地址
        const siteUrl = typeof window !== 'undefined'
            ? window.location.origin
            : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    display_name: displayName,
                },
                emailRedirectTo: `${siteUrl}/auth/callback`,
            },
        })
        return { error }
    }

    // 登出
    const signOut = async () => {
        const { error } = await supabase.auth.signOut()
        return { error }
    }

    // 刷新用户信息
    const refreshUser = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        await fetchUserProfile(user)
    }

    return {
        ...authState,
        signIn,
        signUp,
        signOut,
        refreshUser,
    }
}
