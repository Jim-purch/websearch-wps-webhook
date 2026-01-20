// 用户角色类型
export type UserRole = 'user' | 'admin'

// 分享权限类型
export type SharePermission = 'view' | 'use'

// 用户资料
export interface UserProfile {
    id: string
    email: string
    display_name: string | null
    role: UserRole
    is_active: boolean
    created_at: string
    updated_at: string
}

// WPS Token
export interface Token {
    id: string
    user_id: string
    name: string
    token_value: string
    description: string | null
    webhook_url: string | null
    is_active: boolean
    created_at: string
    updated_at: string
}

// Token 分享
export interface TokenShare {
    id: string
    token_id: string
    shared_by: string
    shared_with: string | null
    share_code: string | null
    permission: SharePermission
    is_active: boolean
    expires_at: string | null
    created_at: string
}

// 创建 Token 的输入
export interface CreateTokenInput {
    name: string
    token_value: string
    description?: string
    webhook_url?: string
}

// 更新 Token 的输入
export interface UpdateTokenInput {
    name?: string
    token_value?: string
    description?: string
    webhook_url?: string
    is_active?: boolean
}

// 创建分享的输入
export interface CreateShareInput {
    token_id: string
    shared_with?: string
    permission?: SharePermission
    expires_at?: string
}

// 认证状态
export interface AuthState {
    user: UserProfile | null
    isLoading: boolean
    isAuthenticated: boolean
    isAdmin: boolean
    isActive: boolean
}

// Token 与分享的联合类型（用于显示分享信息）
export interface TokenWithShares extends Token {
    shares?: TokenShare[]
}

// 分享与 Token 的联合类型（用于显示被分享的 Token）
export interface SharedToken extends TokenShare {
    token?: Token
}

// Token 使用操作类型
export type TokenAction = 'create' | 'update' | 'delete' | 'use' | 'share'

// 登录记录
export interface LoginLog {
    id: string
    user_id: string
    login_at: string
    ip_address: string | null
    user_agent: string | null
    // 联表查询时包含用户信息
    user_profiles?: UserProfile
}

// Token 使用记录
export interface TokenUsageLog {
    id: string
    token_id: string | null
    user_id: string
    action: TokenAction
    details: Record<string, unknown> | null
    created_at: string
    // 联表查询时包含用户和 Token 信息
    user_profiles?: UserProfile
    tokens?: Token
}

// 系统统计概览
export interface SystemStatistics {
    totalUsers: number
    activeUsers: number
    inactiveUsers: number
    adminUsers: number
    totalTokens: number
    activeTokens: number
    totalShares: number
    todayLogins: number
    weekLogins: number
    monthLogins: number
}
