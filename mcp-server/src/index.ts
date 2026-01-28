#!/usr/bin/env node
/**
 * WPS MCP Server - stdio 传输入口
 * 
 * 用于本地使用，通过标准输入/输出与 MCP 客户端通信
 */

import 'dotenv/config'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { WpsClient } from './wps-client.js'
import {
    TOOLS,
    GetTableListSchema,
    SearchSchema,
    BatchSearchSchema,
    GetImageUrlsSchema,
    handleGetTableList,
    handleSearch,
    handleBatchSearch,
    handleGetImageUrls
} from './tools.js'

// 从环境变量获取配置
const WPS_WEBHOOK_URL = process.env.WPS_WEBHOOK_URL
const WPS_TOKEN = process.env.WPS_TOKEN

if (!WPS_WEBHOOK_URL || !WPS_TOKEN) {
    console.error('错误: 请设置环境变量 WPS_WEBHOOK_URL 和 WPS_TOKEN')
    console.error('示例:')
    console.error('  export WPS_WEBHOOK_URL="https://airscript.wps.cn/..."')
    console.error('  export WPS_TOKEN="your-token"')
    process.exit(1)
}

// 创建 WPS 客户端
const wpsClient = new WpsClient(WPS_WEBHOOK_URL, WPS_TOKEN)

// 创建 MCP 服务器
const server = new McpServer({
    name: 'wps-mcp-server',
    version: '1.0.0'
})

// 注册工具
server.tool(
    TOOLS[0].name,
    TOOLS[0].description,
    GetTableListSchema.shape,
    async () => handleGetTableList(wpsClient)
)

server.tool(
    TOOLS[1].name,
    TOOLS[1].description,
    SearchSchema.shape,
    async (args) => handleSearch(wpsClient, args)
)

server.tool(
    TOOLS[2].name,
    TOOLS[2].description,
    BatchSearchSchema.shape,
    async (args) => handleBatchSearch(wpsClient, args)
)

server.tool(
    TOOLS[3].name,
    TOOLS[3].description,
    GetImageUrlsSchema.shape,
    async (args) => handleGetImageUrls(wpsClient, args)
)

// 启动服务器
async function main() {
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error('WPS MCP Server (stdio) 已启动')
}

main().catch((error) => {
    console.error('启动失败:', error)
    process.exit(1)
})
