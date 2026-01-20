'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isRegistrationAllowed, setIsRegistrationAllowed] = useState(true) // Default true to avoid flash? Or false? 
    // Best to wait.
    const [checkingStatus, setCheckingStatus] = useState(true)
    const { signUp } = useAuth()
    const supabase = createClient()

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const { data } = await supabase
                    .from('system_settings')
                    .select('value')
                    .eq('key', 'allow_registration')
                    .single()

                if (data) {
                    setIsRegistrationAllowed(data.value)
                }
            } catch (e) {
                console.error('Failed to check registration status', e)
            } finally {
                setCheckingStatus(false)
            }
        }
        checkStatus()
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        if (password !== confirmPassword) {
            setError('两次输入的密码不一致')
            return
        }

        if (password.length < 6) {
            setError('密码长度至少为 6 位')
            return
        }

        setIsLoading(true)

        try {
            const { error } = await signUp(email, password, displayName)
            if (error) {
                setError(error.message)
            } else {
                setSuccess(true)
            }
        } catch {
            setError('注册失败，请重试')
        } finally {
            setIsLoading(false)
        }
    }

    if (checkingStatus) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="spinner" />
            </div>
        )
    }

    if (!isRegistrationAllowed) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="card p-8 w-full max-w-md text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl">🚫</span>
                    </div>
                    <h1 className="text-2xl font-bold mb-4">注册未开放</h1>
                    <p className="text-[var(--text-muted)] mb-6">
                        系统当前暂停新用户注册。<br />
                        请联系管理员为您创建账户。
                    </p>
                    <Link href="/login" className="btn-primary inline-block">
                        返回登录
                    </Link>
                </div>
            </div>
        )
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="card p-8 w-full max-w-md text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl">✅</span>
                    </div>
                    <h1 className="text-2xl font-bold mb-4">注册成功！</h1>
                    <p className="text-[var(--text-muted)] mb-6">
                        请等待管理员激活您的账户。<br />
                        激活后您将收到通知邮件。
                    </p>
                    <Link href="/login" className="btn-primary inline-block">
                        返回登录
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="card p-8 w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl">🔐</span>
                    </div>
                    <h1 className="text-2xl font-bold gradient-text">创建账户</h1>
                    <p className="text-[var(--text-muted)] mt-2">加入 WPS快速查找</p>
                </div>

                {/* 错误提示 */}
                {error && (
                    <div className="alert alert-error mb-6">
                        {error}
                    </div>
                )}

                {/* 表单 */}
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="label">显示名称</label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="input"
                            placeholder="您的名称"
                        />
                    </div>

                    <div>
                        <label className="label">邮箱地址 *</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="input"
                            placeholder="your@email.com"
                            required
                        />
                    </div>

                    <div>
                        <label className="label">密码 *</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="input"
                            placeholder="至少 6 位字符"
                            required
                        />
                    </div>

                    <div>
                        <label className="label">确认密码 *</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="input"
                            placeholder="再次输入密码"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="btn-primary w-full flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <div className="spinner" style={{ width: 20, height: 20 }} />
                                注册中...
                            </>
                        ) : (
                            '注册'
                        )}
                    </button>
                </form>

                {/* 提示 */}
                <div className="alert alert-info mt-6">
                    <strong>注意：</strong>注册后需等待管理员审核激活账户。
                </div>

                {/* 登录链接 */}
                <p className="text-center text-[var(--text-muted)] mt-6">
                    已有账户？{' '}
                    <Link href="/login" className="text-[#667eea] hover:underline font-medium">
                        立即登录
                    </Link>
                </p>
            </div>
        </div>
    )
}
