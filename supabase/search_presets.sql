-- =====================================================
-- 搜索预设表 (Search Presets)
-- 用于保存用户的搜索配置预设
-- 请在 Supabase SQL Editor 中执行此脚本
-- =====================================================

-- 搜索预设表
CREATE TABLE IF NOT EXISTS search_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  token_id UUID NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- 核心配置数据 (使用 JSONB 存储复杂结构)
  selected_table_names JSONB NOT NULL DEFAULT '[]',  -- 选中的表名数组
  columns_data JSONB NOT NULL DEFAULT '{}',          -- 每个表的列信息 {tableName: WpsColumn[]}
  selected_columns JSONB NOT NULL DEFAULT '{}',      -- 搜索列选择 {tableName: string[]}
  column_configs JSONB NOT NULL DEFAULT '{}',        -- 列配置(顺序+是否获取) {tableName: ColumnConfig[]}
  -- 元数据
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_search_presets_user_id ON search_presets(user_id);
CREATE INDEX IF NOT EXISTS idx_search_presets_token_id ON search_presets(token_id);

-- 启用 RLS
ALTER TABLE search_presets ENABLE ROW LEVEL SECURITY;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Users can manage own presets" ON search_presets;

-- RLS 策略：用户只能操作自己的预设
CREATE POLICY "Users can manage own presets" ON search_presets
  FOR ALL USING (auth.uid() = user_id);

-- =====================================================
-- 搜索预设分享表 (Preset Shares)
-- =====================================================
CREATE TABLE IF NOT EXISTS preset_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id UUID NOT NULL REFERENCES search_presets(id) ON DELETE CASCADE,
  shared_by UUID NOT NULL REFERENCES user_profiles(id),
  shared_with UUID REFERENCES user_profiles(id),
  share_code TEXT UNIQUE,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_preset_shares_preset_id ON preset_shares(preset_id);
CREATE INDEX IF NOT EXISTS idx_preset_shares_share_code ON preset_shares(share_code);
CREATE INDEX IF NOT EXISTS idx_preset_shares_shared_with ON preset_shares(shared_with);

-- 启用 RLS
ALTER TABLE preset_shares ENABLE ROW LEVEL SECURITY;

-- 策略
DROP POLICY IF EXISTS "Users can view own preset shares" ON preset_shares;
CREATE POLICY "Users can view own preset shares" ON preset_shares
  FOR SELECT USING (auth.uid() = shared_by);

DROP POLICY IF EXISTS "Users can view preset shares to them" ON preset_shares;
CREATE POLICY "Users can view preset shares to them" ON preset_shares
  FOR SELECT USING (auth.uid() = shared_with);

DROP POLICY IF EXISTS "Public preset shares are viewable" ON preset_shares;
CREATE POLICY "Public preset shares are viewable" ON preset_shares
  FOR SELECT USING (share_code IS NOT NULL AND is_active = true);

DROP POLICY IF EXISTS "Users can create preset shares" ON preset_shares;
CREATE POLICY "Users can create preset shares" ON preset_shares
  FOR INSERT WITH CHECK (
    auth.uid() = shared_by AND
    EXISTS (
      SELECT 1 FROM search_presets
      JOIN tokens ON tokens.id = search_presets.token_id
      WHERE search_presets.id = preset_id 
        AND search_presets.user_id = auth.uid()
        AND tokens.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own preset shares" ON preset_shares;
CREATE POLICY "Users can update own preset shares" ON preset_shares
  FOR UPDATE USING (auth.uid() = shared_by);

DROP POLICY IF EXISTS "Users can delete own preset shares" ON preset_shares;
CREATE POLICY "Users can delete own preset shares" ON preset_shares
  FOR DELETE USING (auth.uid() = shared_by);

DROP POLICY IF EXISTS "Users can delete received preset shares" ON preset_shares;
CREATE POLICY "Users can delete received preset shares" ON preset_shares
  FOR DELETE USING (auth.uid() = shared_with AND share_code IS NULL);

DROP POLICY IF EXISTS "Admins can view all preset shares" ON preset_shares;
CREATE POLICY "Admins can view all preset shares" ON preset_shares
  FOR SELECT USING (public.is_admin());

-- 更新 search_presets 的 SELECT 策略，允许被分享的用户查看
DROP POLICY IF EXISTS "Users can view shared presets" ON search_presets;
CREATE POLICY "Users can view shared presets" ON search_presets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM preset_shares 
      WHERE preset_shares.preset_id = search_presets.id 
      AND preset_shares.shared_with = auth.uid()
      AND preset_shares.is_active = true
      AND (preset_shares.expires_at IS NULL OR preset_shares.expires_at > NOW())
    )
  );

DROP POLICY IF EXISTS "Admins can view all presets" ON search_presets;
CREATE POLICY "Admins can view all presets" ON search_presets
  FOR SELECT USING (public.is_admin());

-- =====================================================
-- RPC: Claim a shared preset via code (Multi-user support)
-- =====================================================
CREATE OR REPLACE FUNCTION claim_shared_preset(code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_share RECORD;
  existing_share RECORD;
  new_share_id UUID;
  current_user_id UUID;
  preset_name TEXT;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '请先登录');
  END IF;

  -- 1. Find the preset share record by code
  SELECT ps.*, sp.name as preset_name INTO target_share
  FROM preset_shares ps
  JOIN search_presets sp ON sp.id = ps.preset_id
  WHERE ps.share_code = code 
    AND ps.is_active = true
    AND (ps.expires_at IS NULL OR ps.expires_at > NOW());

  IF target_share IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '分享码无效或已失效');
  END IF;

  -- 2. Check if user is the owner
  IF target_share.shared_by = current_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', '不能领取自己创建 of 分享');
  END IF;

  -- 3. Check if user already has this preset shared
  SELECT * INTO existing_share
  FROM preset_shares
  WHERE preset_id = target_share.preset_id
    AND shared_with = current_user_id;
    
  IF existing_share IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '您已经拥有此搜索预设的权限');
  END IF;

  -- 4. Create new share record
  INSERT INTO preset_shares (
    preset_id,
    shared_by,
    shared_with,
    is_active
  ) VALUES (
    target_share.preset_id,
    target_share.shared_by,
    current_user_id,
    true
  ) RETURNING id INTO new_share_id;

  RETURN jsonb_build_object('success', true, 'share_id', new_share_id, 'preset_name', target_share.preset_name);
END;
$$;

