<<<<<<< HEAD
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { applySecurity, secureResponse } from '@/lib/security'
import { createSecureSocialAccount } from '@/lib/secure-social-account'

const VALID_PLATFORMS = ['youtube', 'facebook', 'instagram', 'tiktok', 'linkedin']

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request)
  if (error) return error
  return new NextResponse(null, { status: 204 })
=======
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

const VALID_PLATFORMS = ['youtube', 'facebook', 'instagram', 'tiktok', 'linkedin'];

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
}

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
<<<<<<< HEAD
  })

  if (secError || !auth) {
    return (
      secError || NextResponse.json({ error: 'Auth required' }, { status: 401 })
    )
  }
=======
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)

  try {
    const accounts = await db.socialAccount.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        platform: true,
        accountId: true,
        accountName: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
<<<<<<< HEAD
    })

    const res = NextResponse.json(accounts)
    return secureResponse(res, request)
=======
    });

    const res = NextResponse.json(accounts);
    return secureResponse(res, request);
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to fetch social accounts' },
      { status: 500 }
<<<<<<< HEAD
    )
    return secureResponse(res, request)
=======
    );
    return secureResponse(res, request);
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
<<<<<<< HEAD
  })

  if (secError || !auth) {
    return (
      secError || NextResponse.json({ error: 'Auth required' }, { status: 401 })
    )
  }

  try {
    const body = await request.json()
    const { platform, accountId, accountName, accessToken, refreshToken } = body

    if (!platform || !accountId || !accountName || !accessToken) {
      const res = NextResponse.json(
        {
          error:
            'Platform, accountId, accountName, and accessToken are required',
        },
        { status: 400 }
      )
      return secureResponse(res, request)
=======
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { platform, accountId, accountName, accessToken, refreshToken } = body;

    if (!platform || !accountId || !accountName || !accessToken) {
      const res = NextResponse.json(
        { error: 'Platform, accountId, accountName, and accessToken are required' },
        { status: 400 }
      );
      return secureResponse(res, request);
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
    }

    if (!VALID_PLATFORMS.includes(platform)) {
      const res = NextResponse.json(
<<<<<<< HEAD
        {
          error: `Invalid platform. Allowed: ${VALID_PLATFORMS.join(', ')}`,
        },
        { status: 400 }
      )
      return secureResponse(res, request)
    }

    if (accountId.length > 200 || accountName.length > 200) {
      const res = NextResponse.json(
        {
          error: 'accountId and accountName must be at most 200 characters',
        },
        { status: 400 }
      )
      return secureResponse(res, request)
=======
        { error: `Invalid platform. Allowed: ${VALID_PLATFORMS.join(', ')}` },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Input length validation
    if (accountId.length > 200 || accountName.length > 200) {
      const res = NextResponse.json(
        { error: 'accountId and accountName must be at most 200 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
    }

    if (accessToken.length > 5000) {
      const res = NextResponse.json(
        { error: 'accessToken too long (max 5000 characters)' },
        { status: 400 }
<<<<<<< HEAD
      )
      return secureResponse(res, request)
    }

=======
      );
      return secureResponse(res, request);
    }

    // Check if this account is already connected
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
    const existing = await db.socialAccount.findUnique({
      where: {
        userId_platform_accountId: {
          userId: auth.userId,
          platform,
          accountId,
        },
      },
<<<<<<< HEAD
    })
=======
    });
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)

    if (existing) {
      const res = NextResponse.json(
        { error: 'This social account is already connected' },
        { status: 409 }
<<<<<<< HEAD
      )
      return secureResponse(res, request)
    }

    const account = await createSecureSocialAccount({
      userId: auth.userId,
      platform,
      accountId,
      accountName,
      accessToken,
      refreshToken: refreshToken || undefined,
      isActive: true,
    })
=======
      );
      return secureResponse(res, request);
    }

    const account = await db.socialAccount.create({
      data: {
        platform,
        accountId,
        accountName,
        accessToken,
        refreshToken: refreshToken || null,
        userId: auth.userId,
      },
    });
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)

    await db.activityLog.create({
      data: {
        action: 'Social Account Connected',
        details: JSON.stringify({ platform, accountName }),
        category: 'social',
        userId: auth.userId,
      },
<<<<<<< HEAD
    })
=======
    });
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)

    const res = NextResponse.json(
      {
        id: account.id,
        platform: account.platform,
        accountId: account.accountId,
        accountName: account.accountName,
        isActive: account.isActive,
        createdAt: account.createdAt,
      },
      { status: 201 }
<<<<<<< HEAD
    )

    return secureResponse(res, request)
=======
    );
    return secureResponse(res, request);
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to connect social account' },
      { status: 500 }
<<<<<<< HEAD
    )
    return secureResponse(res, request)
=======
    );
    return secureResponse(res, request);
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
  }
}
