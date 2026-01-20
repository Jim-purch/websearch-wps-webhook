'use client'

import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'

export default function AdminPage() {
    const { user } = useAuth()

    return (
        <div className="max-w-6xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">管理员控制台</h1>
                <p className="text-[var(--text-muted)]">
                    欢迎，{user?.display_name || '管理员'}！
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Link href="/admin/users" className="card p-6 hover:shadow-lg transition-shadow">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center text-2xl">
                            👥
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">用户管理</h2>
                            <p className="text-[var(--text-muted)]">管理系统用户和权限</p>
                        </div>
                    </div>
                    <p className="text-sm text-[var(--text-muted)]">
                        激活新用户、管理用户状态、设置管理员权限
                    </p>
                </Link>

                <Link href="/admin/statistics" className="card p-6 hover:shadow-lg transition-shadow">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center text-2xl">
                            📊
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">系统统计</h2>
                            <p className="text-[var(--text-muted)]">查看系统使用情况</p>
                        </div>
                    </div>
                    <p className="text-sm text-[var(--text-muted)]">
                        用户登录记录、Token 创建及使用情况
                    </p>
                </Link>
            </div>
        </div>
    )
}
