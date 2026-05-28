<<<<<<< HEAD
import { NextRequest, NextResponse } from 'next/server'
import { applySecurity, secureResponse } from '@/lib/security'
import {
  getDecryptedWhatsAppConfig,
  upsertSecureWhatsAppConfig,
} from '@/lib/secure-whatsapp-config'
import { db } from '@/lib/db'

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request)
  if (error) return error
  return new NextResponse(null, { status: 204 })
=======
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

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

  try {
    const config = await getDecryptedWhatsAppConfig(auth.userId)

    if (!config) {
      const res = NextResponse.json(null)
      return secureResponse(res, request)
    }

    const res = NextResponse.json({
      id: config.id,
      phoneNumber: config.phoneNumber,
      whatsappId: config.whatsappId,
      phoneNumberId: config.phoneNumberId,
      isActive: config.isActive,
      autoMessage: config.autoMessage,
      autoCall: config.autoCall,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      hasApiToken: !!config.apiToken,
    })

    return secureResponse(res, request)
=======
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const config = await db.whatsAppConfig.findUnique({
      where: { userId: auth.userId },
      select: {
        id: true,
        phoneNumber: true,
        whatsappId: true,
        phoneNumberId: true,
        isActive: true,
        autoMessage: true,
        autoCall: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const res = NextResponse.json(config || null);
    return secureResponse(res, request);
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to fetch WhatsApp config' },
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
    const { phoneNumber, whatsappId, phoneNumberId, apiToken, autoMessage, autoCall } = body
=======
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { phoneNumber, whatsappId, phoneNumberId, apiToken, autoMessage, autoCall } = body;
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)

    if (!phoneNumber) {
      const res = NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
<<<<<<< HEAD
      )
      return secureResponse(res, request)
    }

    const phoneRegex = /^\+?[1-9]\d{6,14}$/
    if (!phoneRegex.test(phoneNumber.replace(/[\s-]/g, ''))) {
      const res = NextResponse.json(
        {
          error:
            'Invalid phone number format. Use international format (e.g., +33612345678)',
        },
        { status: 400 }
      )
      return secureResponse(res, request)
    }

    if (
      phoneNumberId !== undefined &&
      phoneNumberId !== null &&
      phoneNumberId !== ''
    ) {
      const phoneNumberIdRegex = /^\d+$/
      if (!phoneNumberIdRegex.test(String(phoneNumberId))) {
        const res = NextResponse.json(
          {
            error:
              'Phone Number ID must be a numeric string (found in Meta Business Settings)',
          },
          { status: 400 }
        )
        return secureResponse(res, request)
      }
    }

    const existing = await db.whatsAppConfig.findUnique({
      where: { userId: auth.userId },
    })
=======
      );
      return secureResponse(res, request);
    }

    // Validate phone number format (international format)
    const phoneRegex = /^\+?[1-9]\d{6,14}$/;
    if (!phoneRegex.test(phoneNumber.replace(/[\s-]/g, ''))) {
      const res = NextResponse.json(
        { error: 'Invalid phone number format. Use international format (e.g., +33612345678)' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Validate phoneNumberId if provided (should be a numeric string from Meta)
    if (phoneNumberId !== undefined && phoneNumberId !== null && phoneNumberId !== '') {
      const phoneNumberIdRegex = /^\d+$/;
      if (!phoneNumberIdRegex.test(String(phoneNumberId))) {
        const res = NextResponse.json(
          { error: 'Phone Number ID must be a numeric string (found in Meta Business Settings)' },
          { status: 400 }
        );
        return secureResponse(res, request);
      }
    }

    // Check if config already exists
    const existing = await db.whatsAppConfig.findUnique({
      where: { userId: auth.userId },
    });
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)

    if (existing) {
      const res = NextResponse.json(
        { error: 'WhatsApp config already exists. Use PUT to update.' },
        { status: 409 }
<<<<<<< HEAD
      )
      return secureResponse(res, request)
    }

    const config = await upsertSecureWhatsAppConfig({
      userId: auth.userId,
      phoneNumber,
      whatsappId: whatsappId || undefined,
      phoneNumberId: phoneNumberId || undefined,
      apiToken: apiToken || undefined,
      autoMessage: autoMessage ?? false,
      autoCall: autoCall ?? false,
      isActive: !!(apiToken || whatsappId || phoneNumberId),
    })
=======
      );
      return secureResponse(res, request);
    }

    const config = await db.whatsAppConfig.create({
      data: {
        phoneNumber,
        whatsappId: whatsappId || null,
        phoneNumberId: phoneNumberId || null,
        apiToken: apiToken || null,
        autoMessage: autoMessage ?? false,
        autoCall: autoCall ?? false,
        isActive: !!(apiToken || whatsappId || phoneNumberId),
        userId: auth.userId,
      },
    });
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)

    await db.activityLog.create({
      data: {
        action: 'WhatsApp Configured',
<<<<<<< HEAD
        details: JSON.stringify({
          phoneNumber,
          phoneNumberId: phoneNumberId || null,
        }),
        category: 'whatsapp',
        userId: auth.userId,
      },
    })
=======
        details: JSON.stringify({ phoneNumber, phoneNumberId: phoneNumberId || null }),
        category: 'whatsapp',
        userId: auth.userId,
      },
    });
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)

    const res = NextResponse.json(
      {
        id: config.id,
        phoneNumber: config.phoneNumber,
        whatsappId: config.whatsappId,
        phoneNumberId: config.phoneNumberId,
        isActive: config.isActive,
        autoMessage: config.autoMessage,
        autoCall: config.autoCall,
        createdAt: config.createdAt,
<<<<<<< HEAD
        hasApiToken: !!config.apiToken,
      },
      { status: 201 }
    )

    return secureResponse(res, request)
=======
      },
      { status: 201 }
    );
    return secureResponse(res, request);
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to create WhatsApp config' },
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

export async function PUT(request: NextRequest) {
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
    const { phoneNumber, whatsappId, phoneNumberId, apiToken, autoMessage, autoCall } = body

    if (phoneNumber) {
      const phoneRegex = /^\+?[1-9]\d{6,14}$/
      if (!phoneRegex.test(phoneNumber.replace(/[\s-]/g, ''))) {
        const res = NextResponse.json(
          {
            error:
              'Invalid phone number format. Use international format (e.g., +33612345678)',
          },
          { status: 400 }
        )
        return secureResponse(res, request)
      }
    }

    if (
      phoneNumberId !== undefined &&
      phoneNumberId !== null &&
      phoneNumberId !== ''
    ) {
      const phoneNumberIdRegex = /^\d+$/
      if (!phoneNumberIdRegex.test(String(phoneNumberId))) {
        const res = NextResponse.json(
          {
            error:
              'Phone Number ID must be a numeric string (found in Meta Business Settings)',
          },
          { status: 400 }
        )
        return secureResponse(res, request)
      }
    }

    const existing = await getDecryptedWhatsAppConfig(auth.userId)
=======
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { phoneNumber, whatsappId, phoneNumberId, apiToken, autoMessage, autoCall } = body;

    // Validate phone number if provided
    if (phoneNumber) {
      const phoneRegex = /^\+?[1-9]\d{6,14}$/;
      if (!phoneRegex.test(phoneNumber.replace(/[\s-]/g, ''))) {
        const res = NextResponse.json(
          { error: 'Invalid phone number format. Use international format (e.g., +33612345678)' },
          { status: 400 }
        );
        return secureResponse(res, request);
      }
    }

    // Validate phoneNumberId if provided
    if (phoneNumberId !== undefined && phoneNumberId !== null && phoneNumberId !== '') {
      const phoneNumberIdRegex = /^\d+$/;
      if (!phoneNumberIdRegex.test(String(phoneNumberId))) {
        const res = NextResponse.json(
          { error: 'Phone Number ID must be a numeric string (found in Meta Business Settings)' },
          { status: 400 }
        );
        return secureResponse(res, request);
      }
    }

    const existing = await db.whatsAppConfig.findUnique({
      where: { userId: auth.userId },
    });
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)

    if (!existing) {
      const res = NextResponse.json(
        { error: 'WhatsApp config not found. Use POST to create.' },
        { status: 404 }
<<<<<<< HEAD
      )
      return secureResponse(res, request)
    }

    const config = await upsertSecureWhatsAppConfig({
      userId: auth.userId,
      phoneNumber: phoneNumber ?? existing.phoneNumber,
      whatsappId: whatsappId ?? existing.whatsappId ?? undefined,
      phoneNumberId: phoneNumberId ?? existing.phoneNumberId ?? undefined,
      apiToken: apiToken ?? existing.apiToken ?? undefined,
      autoMessage: autoMessage ?? existing.autoMessage,
      autoCall: autoCall ?? existing.autoCall,
      isActive: !!(
        (apiToken ?? existing.apiToken) ||
        (whatsappId ?? existing.whatsappId) ||
        (phoneNumberId ?? existing.phoneNumberId)
      ),
    })
=======
      );
      return secureResponse(res, request);
    }

    const config = await db.whatsAppConfig.update({
      where: { userId: auth.userId },
      data: {
        ...(phoneNumber !== undefined && { phoneNumber }),
        ...(whatsappId !== undefined && { whatsappId }),
        ...(phoneNumberId !== undefined && { phoneNumberId }),
        ...(apiToken !== undefined && { apiToken }),
        ...(autoMessage !== undefined && { autoMessage }),
        ...(autoCall !== undefined && { autoCall }),
        isActive: !!(
          apiToken || existing.apiToken ||
          whatsappId || existing.whatsappId ||
          phoneNumberId || existing.phoneNumberId
        ),
      },
    });
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)

    await db.activityLog.create({
      data: {
        action: 'WhatsApp Config Updated',
<<<<<<< HEAD
        details: JSON.stringify({
          phoneNumber: config.phoneNumber,
          phoneNumberId: config.phoneNumberId,
        }),
        category: 'whatsapp',
        userId: auth.userId,
      },
    })
=======
        details: JSON.stringify({ phoneNumber: config.phoneNumber, phoneNumberId: config.phoneNumberId }),
        category: 'whatsapp',
        userId: auth.userId,
      },
    });
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)

    const res = NextResponse.json({
      id: config.id,
      phoneNumber: config.phoneNumber,
      whatsappId: config.whatsappId,
      phoneNumberId: config.phoneNumberId,
      isActive: config.isActive,
      autoMessage: config.autoMessage,
      autoCall: config.autoCall,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
<<<<<<< HEAD
      hasApiToken: !!config.apiToken,
    })

    return secureResponse(res, request)
=======
    });
    return secureResponse(res, request);
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to update WhatsApp config' },
      { status: 500 }
<<<<<<< HEAD
    )
    return secureResponse(res, request)
  }
        }
=======
    );
    return secureResponse(res, request);
  }
}
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
