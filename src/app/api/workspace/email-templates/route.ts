import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { emailTemplateEngine } from '@/lib/workspace-tools/email-templates';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const { templateId, variables } = await request.json();
  const rendered = emailTemplateEngine.render(templateId, variables);
  if (!rendered) return NextResponse.json({ error: 'Template non trouvé' }, { status: 404 });
  return NextResponse.json({ success: true, ...rendered });
}

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const url = new URL(request.url);
  const category = url.searchParams.get('category') || undefined;
  const language = url.searchParams.get('language') || undefined;
  if (url.searchParams.get('scope') === 'categories') return NextResponse.json({ success: true, categories: emailTemplateEngine.getCategories() });
  return NextResponse.json({ success: true, templates: emailTemplateEngine.list(category, language) });
}
