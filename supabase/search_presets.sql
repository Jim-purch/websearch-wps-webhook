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
