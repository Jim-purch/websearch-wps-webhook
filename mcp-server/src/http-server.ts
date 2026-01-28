#!/usr/bin/env node
/**
 * WPS MCP Server - HTTP 传输入口
 * 
 * 支持 SSE 传输方式 (GET /sse, POST /messages)
 */

import 'dotenv/config'

import express, { Request, Response } from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'

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
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3001', 10)
const HTTP_HOST = process.env.HTTP_HOST || '0.0.0.0'

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

// 创建 MCP 服务器工厂函数
function createMcpServer(): McpServer {
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

    return server
}

// 创建 Express 应用
const app = express()

// 存储活跃的 SSE 传输 (按 session ID)
const sseTransports = new Map<string, SSEServerTransport>()

// SSE 端点 - 建立 SSE 连接
app.get('/sse', async (req: Request, res: Response) => {
    console.log('新的 SSE 连接请求')

    const transport = new SSEServerTransport('/messages', res)
    const server = createMcpServer()

    // 保存传输以便后续消息处理
    sseTransports.set(transport.sessionId, transport)
    console.log(`SSE 会话已创建: ${transport.sessionId}`)

    // 处理连接关闭
    res.on('close', () => {
        sseTransports.delete(transport.sessionId)
        console.log(`SSE 会话已关闭: ${transport.sessionId}`)
    })

    await server.connect(transport)
})

// SSE 消息端点 - 接收客户端消息
// 注意: 不要在这个路由前使用 express.json()，SSEServerTransport 需要原始流
app.post('/messages', async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string

    console.log(`收到消息请求, sessionId: ${sessionId}`)

    if (!sessionId) {
        res.status(400).json({ error: 'Missing sessionId' })
        return
    }

    const transport = sseTransports.get(sessionId)
    if (!transport) {
        res.status(404).json({ error: 'Session not found' })
        return
    }

    await transport.handlePostMessage(req, res)
})

// 以下端点使用 JSON 解析
app.use(express.json())

// 健康检查端点
app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        server: 'wps-mcp-server',
        version: '1.0.0',
        activeSessions: sseTransports.size,
        transport: 'SSE',
        configs: Array.from(clients.keys())
    })
})

// 根路径提示
app.get('/', (_req: Request, res: Response) => {
    res.json({
        name: 'wps-mcp-server',
        version: '1.0.0',
        endpoints: {
            sse: '/sse',
            messages: '/messages',
            health: '/health'
        },
        usage: 'Connect via SSE at /sse endpoint',
        configs: Array.from(clients.keys())
    })
})

// 启动服务器
app.listen(HTTP_PORT, HTTP_HOST, () => {
    console.log(`WPS MCP Server (SSE) 已启动`)
    console.log(`  地址: http://${HTTP_HOST}:${HTTP_PORT}`)
    console.log(`  SSE 端点: http://${HTTP_HOST}:${HTTP_PORT}/sse`)
    console.log(`  健康检查: http://${HTTP_HOST}:${HTTP_PORT}/health`)
    console.log(`  加载配置数: ${clients.size}`)
    console.log('')
    console.log('MCP 客户端配置:')
    console.log(`  { "url": "http://localhost:${HTTP_PORT}/sse" }`)
})
