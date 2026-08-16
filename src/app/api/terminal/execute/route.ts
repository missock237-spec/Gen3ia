import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from '@/lib/auth';
import { executeCommand } from "@/lib/terminal-sandbox";





export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user) return NextResponse.json({ success: false, output: "Non authentifie" }, { status: 401 });
  if (session.user.role !== "admin" && session.user.role !== "developer") {
    return NextResponse.json({ success: false, output: "Acces refuse" }, { status: 403 });
  }
  try {
    const { command } = await request.json();
    if (!command || typeof command !== "string") {
      return NextResponse.json({ success: false, output: "Commande requise" }, { status: 400 });
    }
    const result = executeCommand(command);
    return NextResponse.json({ ...result, duration: 0 });
  } catch (e) {
    return NextResponse.json({ success: false, output: "Erreur: " + (e instanceof Error ? e.message : "inconnue") });
  }
}