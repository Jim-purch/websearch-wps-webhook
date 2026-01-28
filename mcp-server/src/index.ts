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
    ListConfigsSchema,
    handleGetTableList,
    handleSearch,
    handleBatchSearch,
    handleGetImageUrls,
    handleListConfigs
} from './tools.js'

// 配置接口
interface WpsConfig {
    name: string
    webhookUrl: string
    token: string
    description?: string
}

// 客户端管理
const clients = new Map<string, WpsClient>()
const configMeta = new Map<string, { name: string; description?: string }>()
let defaultClientName: string | null = null

// 1. 尝试从 WPS_CONFIG JSON 环境变量加载
const WPS_CONFIG_JSON = process.env.WPS_CONFIG
if (WPS_CONFIG_JSON) {
    try {
        const configs = JSON.parse(WPS_CONFIG_JSON) as WpsConfig[]
        if (Array.isArray(configs)) {
            for (const cfg of configs) {
                if (cfg.name && cfg.webhookUrl && cfg.token) {
                    console.error(`加载配置: ${cfg.name}${cfg.description ? ` (${cfg.description})` : ''}`)
                    clients.set(cfg.name, new WpsClient(cfg.webhookUrl, cfg.token))
                    configMeta.set(cfg.name, { name: cfg.name, description: cfg.description })
                    // 第一个作为默认值
                    if (!defaultClientName) defaultClientName = cfg.name
                }
            }
        }
    } catch (error) {
        console.error('解析 WPS_CONFIG 环境变量失败:', error)
    }
}

// 2. 尝试从单独的环境变量加载 (向后兼容)
const WPS_WEBHOOK_URL = process.env.WPS_WEBHOOK_URL
const WPS_TOKEN = process.env.WPS_TOKEN

if (WPS_WEBHOOK_URL && WPS_TOKEN) {
    // 如果没有配置，或者没有名为 "default" 的配置，添加它
    if (!clients.has('default')) {
        console.error('加载默认配置 (WPS_WEBHOOK_URL)')
        clients.set('default', new WpsClient(WPS_WEBHOOK_URL, WPS_TOKEN))
        configMeta.set('default', { name: 'default', description: '默认配置' })
        // 如果之前没有设置默认值，或者使用了 fallback，将其设为默认
        if (!defaultClientName) defaultClientName = 'default'
    }
}

// 检查是否至少有一个客户端
if (clients.size === 0) {
    console.error('错误: 未找到有效的 WPS 配置')
    console.error('请设置 WPS_CONFIG (JSON Array) 或 WPS_WEBHOOK_URL + WPS_TOKEN')
    process.exit(1)
}

// 获取客户端的辅助函数
const getClient = (name?: string): WpsClient => {
    if (name) {
        const client = clients.get(name)
        if (!client) throw new Error(`未找到配置名为 "${name}" 的 WPS 客户端`)
        return client
    }

    // 如果没有指定名称
    if (defaultClientName && clients.has(defaultClientName)) {
        return clients.get(defaultClientName)!
    }

    // 返回第一个
    const first = clients.values().next().value
    if (first) return first

    throw new Error('无可用 WPS 客户端')
}

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
    async (args) => handleGetTableList(getClient, args)
)

server.tool(
    TOOLS[1].name,
    TOOLS[1].description,
    SearchSchema.shape,
    async (args) => handleSearch(getClient, args)
)

server.tool(
    TOOLS[2].name,
    TOOLS[2].description,
    BatchSearchSchema.shape,
    async (args) => handleBatchSearch(getClient, args)
)

server.tool(
    TOOLS[3].name,
    TOOLS[3].description,
    GetImageUrlsSchema.shape,
    async (args) => handleGetImageUrls(getClient, args)
)

server.tool(
    TOOLS[4].name,
    TOOLS[4].description,
    ListConfigsSchema.shape,
    async () => handleListConfigs(Array.from(configMeta.values()))
)

// 启动服务器
async function main() {
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error(`WPS MCP Server (stdio) 已启动, 加载了 ${clients.size} 个配置`)
}

main().catch((error) => {
    console.error('启动失败:', error)
    process.exit(1)
})

