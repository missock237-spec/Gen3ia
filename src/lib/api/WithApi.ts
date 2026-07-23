import { NextRequest, NextResponse } from "next/server";
import { ZodSchema, ZodError } from "zod";
import { getServerSession } from "@/lib/auth/auth";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

type Handler<TBody, TCtx> = (args: {
  req: NextRequest;
  body: TBody;
  session: TCtx;
}) => Promise<NextResponse>;

interface Options<TBody> {
  schema?: ZodSchema<TBody>;
  auth?: "required" | "optional" | "none";
  rateLimit?: { max: number; window: string }; // ex: "1m"
  roles?: string[];
}

export function withApi<TBody = unknown, TCtx = unknown>(
  opts: Options<TBody>,
  handler: Handler<TBody, TCtx>,
) {
  return async (req: NextRequest) => {
    const requestId = crypto.randomUUID();
    try {
      // 1. Rate limit
      if (opts.rateLimit) {
        const ip = req.headers.get("x-forwarded-for") ?? "unknown";
        const ok = await rateLimit(ip, opts.rateLimit);
        if (!ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }

      // 2. Auth
      let session = null;
      if (opts.auth !== "none") {
        session = await getServerSession(req);
        if (opts.auth === "required" && !session) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (opts.roles && !opts.roles.includes(session?.role)) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }

      // 3. Validation
      let body = {} as TBody;
      if (opts.schema && req.method !== "GET") {
        const raw = await req.json().catch(() => ({}));
        body = opts.schema.parse(raw);
      }

      return await handler({ req, body, session: session as TCtx });
    } catch (err) {
      if (err instanceof ZodError) {
        return NextResponse.json({ error: "Validation", issues: err.issues }, { status: 400 });
      }
      logger.error({ requestId, err }, "API error");
      return NextResponse.json({ error: "Internal error", requestId }, { status: 500 });
    }
  };
}
