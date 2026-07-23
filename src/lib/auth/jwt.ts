import { SignJWT, jwtVerify } from "jose";
const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

export const signJwt = (payload: object) =>
  new SignJWT(payload as any).setProtectedHeader({ alg: "HS256" }).setExpirationTime("7d").sign(secret);

export const verifyJwt = async (token: string) => (await jwtVerify(token, secret)).payload;
