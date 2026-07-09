<div align="center">

# 云表格快速查找 / Cloud Sheet Quick Search

管理、分享您的云表格（WPS 表格 / Google Sheets）脚本令牌，支持跨表快速搜索件号与配件信息。
Manage and share your cloud spreadsheet (WPS / Google Sheets) script tokens, with cross-sheet search for part numbers and component info.

</div>

---

## 目录 / Table of Contents

- [功能 / Features](#功能--features)
- [技术栈 / Tech Stack](#技术栈--tech-stack)
- [快速开始 / Getting Started](#快速开始--getting-started)
- [环境变量 / Environment Variables](#环境变量--environment-variables)
- [数据库配置 / Database Setup](#数据库配置--database-setup)
- [AirScript 脚本模板 / AirScript Templates](#airscript-脚本模板--airscript-templates)
- [项目结构 / Project Structure](#项目结构--project-structure)
- [部署 / Deployment](#部署--deployment)

---

## 功能 / Features

- **Token 管理 / Token Management**：集中管理 WPS 表格和 Google Sheets 的脚本令牌。
  Centrally manage script tokens for WPS Sheets and Google Sheets.

- **件号搜索 / Part-Number Search**：跨多个云表格进行多条件 AND 搜索与批量搜索，支持自动分批回退与增量结果展示。
  Cross-sheet multi-criteria AND search and batch search, with automatic chunked fallback and incremental result streaming.

- **搜索预设 / Search Presets**：保存常用的表选择与列配置，一键复用。
  Save frequently used table selections and column configurations for one-click reuse.

- **分享管理 / Share Management**：通过分享码安全分发 Token，支持 `view` / `use` 权限和过期时间。
  Securely distribute tokens via share codes with `view` / `use` permissions and expiry.

- **用户系统 / User System**：注册、登录、角色（`user` / `admin`）、账户激活控制。
  Registration, login, roles (`user` / `admin`), and account-activation control.

- **管理后台 / Admin Dashboard**：用户管理、系统配置、登录日志与 Token 使用统计。
  User management, system config, login logs, and token usage statistics.

- **MCP 配置生成 / MCP Config**：一键生成选中 Token 的 MCP 配置 JSON。
  Generate MCP config JSON for selected tokens in one click.

- **主题切换 / Theming**：支持浅色 / 深色主题。
  Light / dark theme support.

## 技术栈 / Tech Stack

- [Next.js](https://nextjs.org) 16 (App Router, Turbopack)
- React 19 + TypeScript
- Tailwind CSS v4
- [Supabase](https://supabase.com)（Auth + PostgreSQL + RLS 行级安全）
- [ExcelJS](https://github.com/exceljs/exceljs) + FileSaver（结果导出）
- 部署于 Vercel（含 Cron 定时任务）

## 快速开始 / Getting Started

### 1. 安装依赖 / Install dependencies

```bash
npm install
```

### 2. 配置环境变量 / Configure environment variables

复制示例文件并填写你的 Supabase 凭据：
Copy the example file and fill in your Supabase credentials:

```bash
cp .env.local.example .env.local
```

详见 [环境变量](#环境变量--environment-variables)。
See [Environment Variables](#环境变量--environment-variables).

### 3. 初始化数据库 / Initialize the database

在 Supabase SQL Editor 中依次执行：
Run the following in the Supabase SQL Editor:

```sql
-- schema.sql
-- search_presets.sql
```

详见 [数据库配置](#数据库配置--database-setup)。
See [Database Setup](#数据库配置--database-setup).

### 4. 启动开发服务器 / Start the dev server

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看效果。
Open [http://localhost:3000](http://localhost:3000) to see the result.

### 其他命令 / Other scripts

| 命令 / Command | 说明 / Description |
| --- | --- |
| `npm run build` | 生产构建 / Production build |
| `npm run start` | 启动生产服务器 / Start production server |
| `npm run lint` | 代码检查 / Lint |

## 环境变量 / Environment Variables

| 变量 / Variable | 必填 / Required | 说明 / Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase 项目 URL / Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase 匿名密钥 / Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase 服务端密钥（仅服务端使用）/ Supabase service role key (server-only) |
| `NEXT_PUBLIC_SITE_URL` | ❌ | 站点 URL，用于 OAuth 回调 / Site URL for OAuth callback |
| `NEXT_PUBLIC_WPS_FALLBACK_CHUNK_SIZE` | ❌ | 批量搜索分批回退的单批大小，默认 `10` / Chunk size for batch-search fallback, default `10` |
| `GOOGLE_SHEETS_CACHE_MAX_SIZE` | ❌ | Google Sheets 缓存最大条目数 / Google Sheets cache max size |
| `GOOGLE_SHEETS_CACHE_TTL_SECONDS` | ❌ | Google Sheets 缓存过期秒数 / Google Sheets cache TTL in seconds |
| `CRON_SECRET` | ❌ | 定时任务鉴权密钥 / Cron job authorization secret |

## 数据库配置 / Database Setup

本项目使用 Supabase，数据表通过 Row Level Security (RLS) 保护。执行顺序如下：
This project uses Supabase with Row Level Security (RLS). Run in order:

1. **`supabase/schema.sql`** — 创建用户、Token、分享、日志、系统设置等核心表与 RLS 策略。
   Creates core tables (users, tokens, shares, logs, system settings) and RLS policies.

2. **`supabase/search_presets.sql`** — 创建搜索预设表。
   Creates the search-presets table.

### 设置管理员 / Set up an admin

注册账号后，在 Supabase SQL Editor 中执行：
After registering an account, run in the SQL Editor:

```sql
UPDATE user_profiles
SET role = 'admin', is_active = true
WHERE email = 'your-email@example.com';
```

## AirScript 脚本模板 / AirScript Templates

[`airscript/`](./airscript) 目录提供了部署到 WPS 表格的 AirScript 脚本模板：
The [`airscript/`](./airscript) directory provides AirScript templates to deploy into WPS Sheets:

| 文件 / File | 适用 / Applies To | 说明 / Description |
| --- | --- | --- |
| `airscript_sheet_template.js` | WPS 智能表格 (Excel-style) | 只读查询：表列表、搜索、区域数据 |
| `airscript_dbsheet_template.js` | WPS 多维表格 (Database-style) | 只读查询：表列表、按列搜索、表详情 |
| `airscript_sheet_edit_template.js` | WPS 智能表格 (Excel-style) | 查询 + 编辑（设置值、追加/插入/更新行） |
| `airscript_sheet_auth_write_template.js` | WPS 智能表格 (Excel-style) | 新增操作（追加、插入、设置单元格值） |

使用方法 / Usage：将脚本复制到 WPS 表格的「开发」功能中，生成脚本令牌后填入本系统。
Copy a script into the WPS "Developer" panel, generate a script token, then add it to this app.

## 项目结构 / Project Structure

```
src/
├── app/
│   ├── admin/              # 管理后台 / Admin dashboard
│   ├── api/                # API 路由 / API routes
│   │   ├── wps/proxy/      # WPS Webhook 代理 / WPS webhook proxy (CORS bypass)
│   │   ├── admin/          # 管理操作 / Admin operations
│   │   ├── auth/           # 认证日志 / Auth logging
│   │   ├── cron/           # 定时任务 / Cron jobs (keep-alive)
│   │   └── image-proxy/    # 图片代理 / Image proxy
│   ├── auth/callback/      # OAuth 回调 / OAuth callback
│   ├── dashboard/          # 用户工作台 / User dashboard
│   │   ├── part-search/    # 件号搜索 / Part search
│   │   ├── profile/        # 个人资料 / Profile
│   │   └── shares/         # 分享管理 / Share management
│   ├── login/ register/    # 登录 / 注册 / Login / Register
│   └── shares/[code]/      # 公开分享领取 / Public share claim
├── components/
│   ├── layout/             # 布局组件 / Layout (Header, Sidebar)
│   ├── part-search/        # 搜索相关组件 / Search components
│   └── tokens/             # Token 组件（MCP 配置）/ Token components (MCP config)
├── contexts/               # React Context（主题、侧边栏）/ Contexts (theme, sidebar)
├── hooks/                  # 自定义 Hooks / Custom hooks
├── lib/
│   ├── wps/                # WPS 客户端、解析器、队列 / WPS client, parser, queue
│   ├── googlesheets/       # Google Sheets 客户端 / Google Sheets client
│   ├── supabase/           # Supabase 客户端 / Supabase clients
│   └── wps-logger.ts       # WPS 日志 / WPS logger
├── types/                  # TypeScript 类型定义 / Type definitions
└── middleware.ts           # 路由中间件 / Route middleware
airscript/                  # AirScript 脚本模板 / AirScript templates
supabase/                   # SQL Schema / SQL schema
```

## 部署 / Deployment

本项目针对 Vercel 优化，包含 [`vercel.json`](./vercel.json) 配置（含每日 keep-alive 定时任务）。
This project is optimized for Vercel and includes [`vercel.json`](./vercel.json) (with a daily keep-alive cron job).

1. 推送代码到 GitHub / Push your code to GitHub.
2. 在 Vercel 导入仓库 / Import the repository into Vercel.
3. 在 Vercel 项目设置中配置所有环境变量 / Configure all environment variables in the Vercel project settings.
4. 部署 / Deploy.

> **注意 / Note**：部署后请在 Supabase 的 Auth 设置中添加生产域名为允许的重定向 URL。
> After deploying, add your production domain to Supabase's allowed Auth redirect URLs.
