import { NextRequest, NextResponse } from 'next/server';
import { uploadFile } from '@/lib/upload';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const fileField = formData.get('file') as File | null;
    const subdir = (formData.get('subdir') as string) || 'general';

    if (!fileField) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }

    const result = await uploadFile(fileField, subdir);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur upload' },
      { status: 400 }
    );
  }
}
