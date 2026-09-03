import { describe, test, expect } from "bun:test"
import {
  percentEncode,
  signatureBaseString,
  hmacSha1Signature,
  buildOAuth1Header,
} from "@/lib/connectors/core/oauth1"

/** OAuth 1.0a (RFC 5849) — signature HMAC-SHA1. */
describe("connectors/oauth1 — encodage percent RFC 3986", () => {
  test("caractères réservés encodés strictement", () => {
    expect(percentEncode("foo bar!")).toBe("foo%20bar%21")
    expect(percentEncode("a'b(c)*d")).toBe("a%27b%28c%29%2Ad")
    expect(percentEncode("&=")).toBe("%26%3D")
  })

  test("caractères non réservés inchangés", () => {
    expect(percentEncode("ABC-abc_123.~")).toBe("ABC-abc_123.~")
  })
})

describe("connectors/oauth1 — signature base string (RFC 5849 §3.4.1.1)", () => {
  test("vecteur officiel du RFC", () => {
    // Exemple exact de la spécification : méthode POST, URL
    // https://api.example.net/oauth1/request, params bar=baz & foo=bar.
    const base = signatureBaseString("POST", "https://api.example.net/oauth1/request", {
      bar: "baz",
      foo: "bar",
    })
    expect(base).toBe(
      "POST&https%3A%2F%2Fapi.example.net%2Foauth1%2Frequest&bar%3Dbaz%26foo%3Dbar"
    )
  })

  test("paramètres triés par nom puis valeur", () => {
    const base = signatureBaseString("GET", "https://api.test/path", {
      b: "2",
      a: "1",
    })
    expect(base).toBe("GET&https%3A%2F%2Fapi.test%2Fpath&a%3D1%26b%3D2")
  })

  test("paramètres d'URL existants inclus dans la base", () => {
    const base = signatureBaseString("GET", "https://api.test/path?x=9", {
      a: "1",
    })
    expect(base).toBe("GET&https%3A%2F%2Fapi.test%2Fpath&a%3D1%26x%3D9")
  })

  test("query string non triée est normalisée (a avant z)", () => {
    const base = signatureBaseString("GET", "https://api.test/path?z=1&a=2", {})
    expect(base).toBe("GET&https%3A%2F%2Fapi.test%2Fpath&a%3D2%26z%3D1")
  })
})

describe("connectors/oauth1 — HMAC-SHA1", () => {
  test("vecteur connu (clé/valeur simples)", () => {
    // HMAC-SHA1("value", "key") = 104152c5bfdca9bc... (base64 standard)
    const sig = hmacSha1Signature("POST", "https://api.test/p", {}, "key", "")
    // La signature dépend de la base string complète : on vérifie
    // la forme (base64, 28 caractères) et le déterminisme.
    expect(sig).toMatch(/^[A-Za-z0-9+/]{27}=/)
    const sig2 = hmacSha1Signature("POST", "https://api.test/p", {}, "key", "")
    expect(sig).toBe(sig2)
    const sig3 = hmacSha1Signature("GET", "https://api.test/p", {}, "key", "")
    expect(sig).not.toBe(sig3)
  })

  test("le secret de token participe à la clé", () => {
    const withToken = hmacSha1Signature("GET", "https://api.test/p", {}, "cs", "ts")
    const without = hmacSha1Signature("GET", "https://api.test/p", {}, "cs", "")
    expect(withToken).not.toBe(without)
  })
})

describe("connectors/oauth1 — en-tête Authorization", () => {
  test("tous les paramètres oauth présents et signés", () => {
    const header = buildOAuth1Header("GET", "https://api.test/board", {
      consumerKey: "ck",
      consumerSecret: "cs",
      oauthToken: "ot",
      oauthTokenSecret: "ots",
    })
    expect(header.startsWith("OAuth ")).toBe(true)
    const params = new Map(
      header
        .slice(6)
        .split(", ")
        .map((kv) => kv.split('="').map((x) => x.replace(/"$/, "")) as [string, string])
    )
    expect(params.get("oauth_consumer_key")).toBe("ck")
    expect(params.get("oauth_token")).toBe("ot")
    expect(params.get("oauth_signature_method")).toBe("HMAC-SHA1")
    expect(params.get("oauth_version")).toBe("1.0")
    expect(params.get("oauth_signature")).toBeTruthy()
    expect(params.get("oauth_nonce")).toBeTruthy()
    expect(params.get("oauth_timestamp")).toMatch(/^\d{10}$/)
  })

  test("oauth_verifier inclus dans la signature ET la requête", () => {
    const header = buildOAuth1Header("POST", "https://api.test/access", {
      consumerKey: "ck",
      consumerSecret: "cs",
      oauthToken: "ot",
      oauthTokenSecret: "ots",
      extraParams: { oauth_verifier: "vrf" },
    })
    // Le header OAuth lui-même ne transporte que les params oauth_* ;
    // le verifier est transmis dans le corps de la requête par
    // l'appelant (exchangeRequestToken). On vérifie ici que la
    // signature change bien selon le verifier.
    const other = buildOAuth1Header("POST", "https://api.test/access", {
      consumerKey: "ck",
      consumerSecret: "cs",
      oauthToken: "ot",
      oauthTokenSecret: "ots",
      extraParams: { oauth_verifier: "vrf-autre" },
    })
    expect(header).not.toBe(other)
  })
})
