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
    handleGetTableList,
    handleSearch,
    handleBatchSearch,
    handleGetImageUrls
} from './tools.js'

// 从环境变量获取配置
const WPS_WEBHOOK_URL = process.env.WPS_WEBHOOK_URL
const WPS_TOKEN = process.env.WPS_TOKEN
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3001', 10)
const HTTP_HOST = process.env.HTTP_HOST || '0.0.0.0'

if (!WPS_WEBHOOK_URL || !WPS_TOKEN) {
    console.error('错误: 请设置环境变量 WPS_WEBHOOK_URL 和 WPS_TOKEN')
    console.error('示例:')
    console.error('  export WPS_WEBHOOK_URL="https://airscript.wps.cn/..."')
    console.error('  export WPS_TOKEN="your-token"')
    process.exit(1)
}

// 创建 WPS 客户端
const wpsClient = new WpsClient(WPS_WEBHOOK_URL, WPS_TOKEN)

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
        transport: 'SSE'
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
        usage: 'Connect via SSE at /sse endpoint'
    })
})

// 启动服务器
app.listen(HTTP_PORT, HTTP_HOST, () => {
    console.log(`WPS MCP Server (SSE) 已启动`)
    console.log(`  地址: http://${HTTP_HOST}:${HTTP_PORT}`)
    console.log(`  SSE 端点: http://${HTTP_HOST}:${HTTP_PORT}/sse`)
    console.log(`  健康检查: http://${HTTP_HOST}:${HTTP_PORT}/health`)
    console.log('')
    console.log('MCP 客户端配置:')
    console.log(`  { "url": "http://localhost:${HTTP_PORT}/sse" }`)
})
