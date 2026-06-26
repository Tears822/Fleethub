/**
 * OAuth2 client_credentials token fetch (used by Uber / FreeNow connectors when token URLs are set).
 */
export type TokenOk = { ok: true; accessToken: string };
export type TokenErr = { ok: false; message: string };
export type TokenResult = TokenOk | TokenErr;

export async function fetchClientCredentialsToken(args: {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
}): Promise<TokenResult> {
  try {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: args.clientId,
      client_secret: args.clientSecret,
    });
    if (args.scope) {
      body.set("scope", args.scope);
    }
    const res = await fetch(args.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status}: ${text.slice(0, 400)}` };
    }
    let json: unknown;
    try {
      json = JSON.parse(text) as { access_token?: string };
    } catch {
      return { ok: false, message: "Token response was not JSON" };
    }
    const accessToken =
      typeof json === "object" && json !== null && "access_token" in json
        ? (json as { access_token?: string }).access_token
        : undefined;
    if (!accessToken) {
      return { ok: false, message: "Token JSON missing access_token" };
    }
    return { ok: true, accessToken };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}

/** OAuth2 client_credentials with HTTP Basic (client_id:client_secret). Used by FreeNow Booking API. */
export async function fetchClientCredentialsTokenBasicAuth(args: {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
}): Promise<TokenResult> {
  try {
    const basic = Buffer.from(`${args.clientId}:${args.clientSecret}`, "utf8").toString("base64");
    const res = await fetch(args.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status}: ${text.slice(0, 400)}` };
    }
    let json: unknown;
    try {
      json = JSON.parse(text) as { access_token?: string };
    } catch {
      return { ok: false, message: "Token response was not JSON" };
    }
    const accessToken =
      typeof json === "object" && json !== null && "access_token" in json
        ? (json as { access_token?: string }).access_token
        : undefined;
    if (!accessToken) {
      return { ok: false, message: "Token JSON missing access_token" };
    }
    return { ok: true, accessToken };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}
