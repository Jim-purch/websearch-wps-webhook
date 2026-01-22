import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const url = searchParams.get('url')

    if (!url) {
        return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
    }

    try {
        const response = await fetch(url)
        if (!response.ok) {
            return NextResponse.json(
                { error: `Failed to fetch image: ${response.statusText}` },
                { status: response.status }
            )
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream'
        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600'
            }
        })
    } catch (error) {
        console.error('Image proxy error:', error)
        return NextResponse.json({ error: 'Failed to process image' }, { status: 500 })
    }
}
