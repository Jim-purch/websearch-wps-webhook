-- =====================================================
-- WPS Token 管理系统数据库 Schema
-- 请在 Supabase SQL Editor 中执行此脚本
-- =====================================================

-- 用户扩展表（存储额外的用户信息）
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- WPS Token 表
CREATE TABLE IF NOT EXISTS tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_value TEXT NOT NULL,
  description TEXT,
  webhook_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Token 分享表
CREATE TABLE IF NOT EXISTS token_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES user_profiles(id),
  shared_with UUID REFERENCES user_profiles(id),
  share_code TEXT UNIQUE,
  permission TEXT DEFAULT 'view' CHECK (permission IN ('view', 'use')),
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_tokens_user_id ON tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_token_shares_token_id ON token_shares(token_id);
CREATE INDEX IF NOT EXISTS idx_token_shares_share_code ON token_shares(share_code);
CREATE INDEX IF NOT EXISTS idx_token_shares_shared_with ON token_shares(shared_with);

-- =====================================================
-- 辅助函数：检查用户是否为管理员（使用 SECURITY DEFINER 绕过 RLS）
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role 
  FROM public.user_profiles 
  WHERE id = auth.uid();
  
  RETURN user_role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================================
-- Row Level Security (RLS) 策略
-- =====================================================

-- 启用 RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_shares ENABLE ROW LEVEL SECURITY;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can view own tokens" ON tokens;
DROP POLICY IF EXISTS "Users can create tokens" ON tokens;
DROP POLICY IF EXISTS "Users can update own tokens" ON tokens;
DROP POLICY IF EXISTS "Users can delete own tokens" ON tokens;
DROP POLICY IF EXISTS "Users can view shared tokens" ON tokens;
DROP POLICY IF EXISTS "Users can view own shares" ON token_shares;
DROP POLICY IF EXISTS "Users can view shares to them" ON token_shares;
DROP POLICY IF EXISTS "Users can create shares for own tokens" ON token_shares;
DROP POLICY IF EXISTS "Users can update own shares" ON token_shares;
DROP POLICY IF EXISTS "Users can delete own shares" ON token_shares;

-- user_profiles 策略
-- 用户可以查看自己的资料，管理员可以查看所有
CREATE POLICY "Users can view profiles" ON user_profiles
  FOR SELECT USING (
    auth.uid() = id OR public.is_admin()
  );

-- 用户可以更新自己的资料
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 管理员可以更新所有用户
CREATE POLICY "Admins can update all profiles" ON user_profiles
  FOR UPDATE USING (public.is_admin());

-- tokens 策略
-- 用户可以查看自己的 token
CREATE POLICY "Users can view own tokens" ON tokens
  FOR SELECT USING (auth.uid() = user_id);

-- 用户可以创建 token
CREATE POLICY "Users can create tokens" ON tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 用户可以更新自己的 token
CREATE POLICY "Users can update own tokens" ON tokens
  FOR UPDATE USING (auth.uid() = user_id);

-- 用户可以删除自己的 token
CREATE POLICY "Users can delete own tokens" ON tokens
  FOR DELETE USING (auth.uid() = user_id);

-- 用户可以查看被分享给自己的 token
CREATE POLICY "Users can view shared tokens" ON tokens
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM token_shares 
      WHERE token_shares.token_id = tokens.id 
      AND (token_shares.shared_with = auth.uid() OR token_shares.share_code IS NOT NULL)
      AND token_shares.is_active = true
      AND (token_shares.expires_at IS NULL OR token_shares.expires_at > NOW())
    )
  );

-- token_shares 策略
-- 用户可以查看自己创建的分享
CREATE POLICY "Users can view own shares" ON token_shares
  FOR SELECT USING (auth.uid() = shared_by);

-- 用户可以查看分享给自己的记录
CREATE POLICY "Users can view shares to them" ON token_shares
  FOR SELECT USING (auth.uid() = shared_with);

-- 公开分享可以被任何人查看（用于分享链接）
CREATE POLICY "Public shares are viewable" ON token_shares
  FOR SELECT USING (share_code IS NOT NULL AND is_active = true);

-- 用户可以创建分享（只能分享自己的 token）
CREATE POLICY "Users can create shares for own tokens" ON token_shares
  FOR INSERT WITH CHECK (
    auth.uid() = shared_by AND
    EXISTS (SELECT 1 FROM tokens WHERE tokens.id = token_id AND tokens.user_id = auth.uid())
  );

-- 用户可以更新自己创建的分享
CREATE POLICY "Users can update own shares" ON token_shares
  FOR UPDATE USING (auth.uid() = shared_by);

-- 用户可以删除自己创建的分享
CREATE POLICY "Users can delete own shares" ON token_shares
  FOR DELETE USING (auth.uid() = shared_by);

-- =====================================================
-- 触发器：自动创建 user_profile
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, display_name, is_active)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 删除旧触发器（如果存在）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 创建触发器
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 初始化管理员账户（可选）
-- 注意：请先通过邮箱注册，然后运行以下命令将账户设为管理员
-- =====================================================

-- 将指定邮箱设为管理员并激活
-- UPDATE user_profiles SET role = 'admin', is_active = true WHERE email = 'your-admin@email.com';
