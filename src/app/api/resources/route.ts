import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { applySecurity, secureResponse } from '@/lib/security'
import {
  createSecureUserResource,
  listSecureUserResources,
} from '@/lib/secure-user-resource'

const VALID_TYPES = ['cpu', 'api', 'mvp', 'database', 'storage']

function parseConfig(config: string) {
  try {
    return JSON.parse(config)
  } catch {
    return {}
  }
}

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request)
  if (error) return error
  return new NextResponse(null, { status: 204 })
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  })

  if (secError || !auth) {
    return (
      secError || NextResponse.json({ error: 'Auth required' }, { status: 401 })
    )
  }

  try {
    const typeFilter = request.nextUrl.searchParams.get('type')
    const safeType =
      typeFilter && VALID_TYPES.includes(typeFilter) ? typeFilter : undefined

    const resources = await listSecureUserResources(auth.userId, safeType)

    const parsedResources = resources.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      config: parseConfig(r.config),
      endpoint: r.endpoint,
      isActive: r.isActive,
      hasApiKey: !!r.apiKey,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))

    const res = NextResponse.json(parsedResources)
    return secureResponse(res, request)
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to fetch resources' },
      { status: 500 }
    )
    return secureResponse(res, request)
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  })

  if (secError || !auth) {
    return (
      secError || NextResponse.json({ error: 'Auth required' }, { status: 401 })
    )
  }

  try {
    const body = await request.json()
    const { type, name, config, apiKey, endpoint } = body

    if (!type || !name || config === undefined || config === null) {
      const res = NextResponse.json(
        { error: 'Type, name, and config are required' },
        { status: 400 }
      )
      return secureResponse(res, request)
    }

    if (name.length > 100) {
      const res = NextResponse.json(
        { error: 'Name must be at most 100 characters' },
        { status: 400 }
      )
      return secureResponse(res, request)
    }

    if (!VALID_TYPES.includes(type)) {
      const res = NextResponse.json(
        { error: `Invalid resource type. Allowed: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      )
      return secureResponse(res, request)
    }

    const resource = await createSecureUserResource({
      userId: auth.userId,
      type,
      name,
      config: typeof config === 'string' ? config : JSON.stringify(config),
      apiKey: apiKey || undefined,
      endpoint: endpoint || null,
      isActive: true,
    })

    await db.activityLog.create({
      data: {
        action: 'Resource Added',
        details: JSON.stringify({ type, name }),
        category: 'resource',
        userId: auth.userId,
      },
    })

    const res = NextResponse.json(
      {
        id: resource.id,
        type: resource.type,
        name: resource.name,
        config: parseConfig(resource.config),
        hasApiKey: !!resource.apiKey,
        endpoint: resource.endpoint,
        isActive: resource.isActive,
        createdAt: resource.createdAt,
      },
      { status: 201 }
    )

    return secureResponse(res, request)
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to create resource' },
      { status: 500 }
    )
    return secureResponse(res, request)
  }
}
