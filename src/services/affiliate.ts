import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export class AffiliateProgram {
  async createLink(userId: string): Promise<string> {
    const code = `gen_${userId.slice(0,6)}_${Date.now().toString(36)}`;
    await prisma.accessKey.create({data:{userId,name:`Affiliate-${code}`,service:"affiliate",keyValue:code,scopes:"read",metadata:JSON.stringify({type:"affiliate_link"})}});
    return `https://genova.app?ref=${code}`;
  }
  async trackConversion(refCode: string, newUserId: string): Promise<void> {
    const link = await prisma.accessKey.findFirst({where:{keyValue:refCode,service:"affiliate"}});
    if (!link) return;
    await prisma.creditTransaction.create({data:{userId:link.userId,amount:150,balance:150,type:"bonus",resourceType:"affiliate",description:`Parrainage ${newUserId.slice(0,8)}`}});
  }
}
export const affiliate = new AffiliateProgram();