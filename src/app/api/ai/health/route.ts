import { NextResponse } from 'next/server';
export async function GET() { return NextResponse.json({ status: 'ok', model: 'genova', timestamp: new Date().toISOString() }); }
