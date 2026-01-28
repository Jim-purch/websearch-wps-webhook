# Jim WPS MCP Server

一个用于 WPS Webhook 集成的 MCP (Model Context Protocol) 服务器，让 AI 应用直接查询 WPS 文档数据。

## 功能

| 工具名称 | 描述 |
|---------|------|
| `get_table_list` | 获取所有表/工作表信息 |
| `search` | 多条件 AND 搜索 |
| `batch_search` | 批量搜索 |
| `get_image_urls` | 获取图片 URL |

## 快速使用 (npx)

无需安装，直接使用 npx 运行：

```bash
# stdio 模式 (本地 AI 应用)
npx jim-wps-mcp-server

# HTTP 模式 (局域网访问)
npx jim-wps-mcp-http
```

需要设置环境变量：
```bash
export WPS_WEBHOOK_URL="https://airscript.wps.cn/your-webhook-path"
export WPS_TOKEN="your-airscript-token"
```

## MCP 客户端配置

### stdio 模式 (推荐)

在 Claude Desktop 或其他 MCP 客户端的配置中添加：

```json
{
  "mcpServers": {
    "wps": {
      "command": "npx",
      "args": ["-y", "jim-wps-mcp-server@latest"],
      "env": {
        "WPS_WEBHOOK_URL": "https://airscript.wps.cn/your-webhook-path",
        "WPS_TOKEN": "your-airscript-token"
      }
    }
  }
}
```

### HTTP/SSE 模式 (局域网访问)

先启动 HTTP 服务器：
```bash
WPS_WEBHOOK_URL="..." WPS_TOKEN="..." npx wps-mcp-http
```

然后配置客户端：
```json
{
  "mcpServers": {
    "wps": {
      "url": "http://192.168.1.100:3001/sse"
    }
  }
}
```

## 本地开发

### 安装依赖

```bash
npm install
```

### 配置环境变量

复制环境变量模板并编辑：
```bash
cp .env.example .env
```

编辑 `.env`：
```env
WPS_WEBHOOK_URL=https://airscript.wps.cn/your-webhook-path
WPS_TOKEN=your-airscript-token
HTTP_PORT=3001      # SSE 模式的端口
HTTP_HOST=0.0.0.0   # SSE 模式的监听地址
```

### 启动方式

本项目支持两种传输模式，请根据你的使用场景选择：

| 模式 | 命令 | 使用场景 |
|------|------|----------|
| **stdio** | `npm start` | 本地 AI 应用（如 Claude Desktop）通过标准输入/输出通信 |
| **SSE/HTTP** | `npm run start:http` | 局域网访问，通过 HTTP SSE 协议通信 |

#### stdio 模式（本地使用）

```bash
# 生产模式
npm start

# 开发模式（支持热重载）
npm run dev
```

适用于：Claude Desktop 等本地 MCP 客户端，通过 `command` 配置启动。

#### SSE/HTTP 模式（网络访问）

```bash
# 生产模式
npm run start:http

# 开发模式（支持热重载）
npm run dev:http
```

启动后会输出：
```
WPS MCP Server (SSE) 已启动
  地址: http://0.0.0.0:3001
  SSE 端点: http://0.0.0.0:3001/sse
  健康检查: http://0.0.0.0:3001/health
```

适用于：需要通过网络访问的场景，MCP 客户端使用 `url` 配置连接。

### 构建

```bash
npm run build
```

## 通过 npm 安装使用

```bash
npm install jim-wps-mcp-server
```

## 工具示例

### get_table_list
```json
{}
```

### search
```json
{
  "sheetName": "零件表",
  "criteria": [
    { "columnName": "件号", "searchValue": "ABC123", "op": "Contains" }
  ],
  "returnColumns": ["件号", "名称", "价格"]
}
```

### batch_search
```json
{
  "sheetName": "零件表",
  "batchCriteria": [
    { "id": "Q1", "criteria": [{ "columnName": "件号", "searchValue": "ABC", "op": "Contains" }] },
    { "id": "Q2", "criteria": [{ "columnName": "件号", "searchValue": "XYZ", "op": "Equals" }] }
  ]
}
```

### get_image_urls
```json
{
  "sheetName": "零件表",
  "cells": ["D5", "D6", "D7"]
}
```

## License

MIT
