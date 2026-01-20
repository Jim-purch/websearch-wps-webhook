'use client'

import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'

export default function InactivePage() {
    const { user, signOut } = useAuth()

    const handleSignOut = async () => {
        await signOut()
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="card p-8 w-full max-w-md text-center">
                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">⏳</span>
                </div>
                <h1 className="text-2xl font-bold mb-4">账户待激活</h1>
                <p className="text-[var(--text-muted)] mb-2">
                    您好，<strong>{user?.display_name || user?.email}</strong>
                </p>
                <p className="text-[var(--text-muted)] mb-6">
                    您的账户尚未被管理员激活。<br />
                    请耐心等待，激活后您将可以正常使用系统。
                </p>
                <div className="flex gap-4 justify-center">
                    <button onClick={handleSignOut} className="btn-secondary">
                        退出登录
                    </button>
                    <Link href="/login" className="btn-primary">
                        刷新状态
                    </Link>
                </div>
            </div>
        </div>
    )
}
