import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";



export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const [total, byReason, byAgent, recent] = await Promise.all([
      prisma.supervisorLog.count({where:{decision:"stop"}}),
      prisma.supervisorLog.groupBy({by:["reason"],where:{decision:"stop"},_count:true,orderBy:{_count:{reason:"desc"}}}),
      prisma.supervisorLog.groupBy({by:["agentId"],where:{decision:"stop"},_count:true,orderBy:{_count:{agentId:"desc"}},take:10}),
      prisma.supervisorLog.findMany({where:{decision:{not:"continue"}},orderBy:{createdAt:"desc"},take:50,select:{id:true,agentId:true,reason:true,decision:true,createdAt:true}}),
    ]);
    return NextResponse.json({totalAlerts:total,byReason,topAgents:byAgent,recentAlerts:recent});
  } catch { return NextResponse.json({error:"Erreur"},{status:500}); }
}