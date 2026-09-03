import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { encryptJSON } from "@/lib/security/encryption"

const connectionSchema = z.object({
  type: z.enum(["postgresql", "mysql", "mongodb", "salesforce", "hubspot", "notion", "slack"]),
  name: z.string(),
  config: z.record(z.string(), z.unknown()),
})

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const body = await readJson(req, connectionSchema)
    // Chiffrer les credentials
    const encrypted = await encryptJSON(body.config, process.env.ENCRYPTION_KEY ?? "gen3ia-encryption-key")
    const conn = await db.externalConnection.create({
      data: { userId: user.id, type: body.type, name: body.name, config: encrypted },
    })
    return Response.json({ ok: true, connectionId: conn.id })
  })
}

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const connections = await db.externalConnection.findMany({ where: { userId: user.id }, select: { id: true, type: true, name: true, active: true, createdAt: true } })
    return Response.json({ ok: true, connections })
  })
}
