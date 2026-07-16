import { NextRequest, NextResponse } from 'next/server';
import { SSOManager } from '@/lib/auth/saml';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const SAMLResponse = formData.get('SAMLResponse')?.toString() || '';
    const provider = formData.get('provider')?.toString() || 'okta';

    const ssoManager = new SSOManager();
    const userData = await ssoManager.validateSAMLResponse(SAMLResponse, provider);
    
    if (!ssoManager.isEmailAllowed(userData.email)) {
      return NextResponse.json({ error: 'Domaine non autorise' }, { status: 403 });
    }

    return NextResponse.json({ success: true, user: userData, redirectTo: '/dashboard' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
