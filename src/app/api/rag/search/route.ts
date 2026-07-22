import { NextRequest, NextResponse } from "next/server";
import { hybridSearch } from "@/lib/rag/hybrid-search";

export async function POST(request: NextRequest) {
  try {
    const { query, userId, sources, limit, filters } = await request.json();
    if (!query || !userId) return NextResponse.json({ error: "query et userId requis" }, { status: 400 });
    const results = await hybridSearch.search({ query, userId, sources, limit, filters });
    return NextResponse.json({ results, count: results.length, query });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
