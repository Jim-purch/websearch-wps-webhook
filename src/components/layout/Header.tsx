'use client'

import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'

export function Header() {
    const { user, isAdmin, signOut } = useAuth()
    const router = useRouter()

    const handleSignOut = async () => {
        await signOut()
        router.push('/login')
    }

    return (
        <header className="header">
            <div className="flex items-center gap-4">
                <Link href="/dashboard" className="text-xl font-bold text-white hover:opacity-90">
                    🔐 WPS Token Manager
                </Link>
            </div>

            <div className="flex items-center gap-4">
                {user && (
                    <>
                        <span className="text-white/80 text-sm">
                            {user.display_name || user.email}
                            {isAdmin && <span className="ml-2 text-xs bg-white/20 px-2 py-0.5 rounded">管理员</span>}
                        </span>
                        <button
                            onClick={handleSignOut}
                            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm transition-all"
                        >
                            退出登录
                        </button>
                    </>
                )}
            </div>
        </header>
    )
}
