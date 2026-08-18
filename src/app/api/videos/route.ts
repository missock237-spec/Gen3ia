// ============================================================
// GET /api/videos — Liste des vidéos générées
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");

  if (!userId) {
    return NextResponse.json({ error: "Paramètre userId requis" }, { status: 400 });
  }

  const skip = (page - 1) * limit;

  const [videos, total] = await Promise.all([
    prisma.videoGeneration.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true, prompt: true, model: true, status: true,
        videoUrl: true, costUsd: true, durationSeconds: true,
        width: true, height: true, createdAt: true,
      },
    }),
    prisma.videoGeneration.count({ where: { userId } }),
  ]);

  return NextResponse.json({
    videos,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { userId, prompt, model, negativePrompt, numFrames, width, height } = body;

  if (!userId || !prompt) {
    return NextResponse.json({ error: "Champs requis: userId, prompt" }, { status: 400 });
  }

  // Rediriger vers le service dédié
  const { videoGenerator } = await import("@/lib/video-generator");
  const result = await videoGenerator.generate({ userId, prompt, model, negativePrompt, numFrames, width, height });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ success: true, videoUrl: result.videoUrl, generationId: result.generationId });
}