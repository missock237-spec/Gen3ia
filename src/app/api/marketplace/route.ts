import { NextRequest, NextResponse } from "next/server";
import { marketplace } from "@/services/marketplace";
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query") ?? undefined;
  const type = request.nextUrl.searchParams.get("type") ?? undefined;
  const page = parseInt(request.nextUrl.searchParams.get("page") ?? "1");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "20");
  const result = await marketplace.search({ query, type, page, limit });
  return NextResponse.json(result);
}