'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const { signIn } = useAuth()
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setIsLoading(true)

        try {
            const { error } = await signIn(email, password)
            if (error) {
                setError(error.message)
            } else {
                router.push('/dashboard/part-search')
            }
        } catch {
            setError('登录失败，请重试')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="card p-8 w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl">🔐</span>
                    </div>
                    <h1 className="text-2xl font-bold gradient-text">WPS快速查询</h1>
                    <p className="text-[var(--text-muted)] mt-2">登录您的账户</p>
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
                        <label className="label">邮箱地址</label>
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
                        <label className="label">密码</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="input"
                            placeholder="••••••••"
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
                                登录中...
                            </>
                        ) : (
                            '登录'
                        )}
                    </button>
                </form>

                {/* 注册链接 */}
                <p className="text-center text-[var(--text-muted)] mt-6">
                    还没有账户？{' '}
                    <Link href="/register" className="text-[#667eea] hover:underline font-medium">
                        立即注册
                    </Link>
                </p>
            </div>
        </div>
    )
}
