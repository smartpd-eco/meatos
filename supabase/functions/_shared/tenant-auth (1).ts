declare const Deno: {
  env: { get(key: string): string | undefined };
};

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; message: string };

function bearerToken(request: Request): string {
  const value = request.headers.get("authorization") ?? "";
  return /^Bearer\s+\S+$/i.test(value) ? value : "";
}

function supabaseConfig() {
  return {
    url: Deno.env.get("SUPABASE_URL") ?? "",
    anonKey: Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  };
}

export async function requireAuthenticatedUser(request: Request): Promise<AuthResult> {
  const authorization = bearerToken(request);
  const { url, anonKey } = supabaseConfig();
  if (!authorization) return { ok: false, status: 401, message: "AUTHENTICATION_REQUIRED" };
  if (!url || !anonKey) return { ok: false, status: 503, message: "AUTH_SERVICE_NOT_CONFIGURED" };

  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, authorization }
    });
    if (!response.ok) return { ok: false, status: 401, message: "INVALID_OR_EXPIRED_SESSION" };
    const user = await response.json() as { id?: string };
    if (!user.id) return { ok: false, status: 401, message: "INVALID_OR_EXPIRED_SESSION" };
    return { ok: true, userId: user.id };
  } catch {
    return { ok: false, status: 503, message: "AUTH_SERVICE_UNAVAILABLE" };
  }
}

export async function requireTenantMembership(
  request: Request,
  tenantId: string
): Promise<AuthResult> {
  if (!tenantId) return { ok: false, status: 400, message: "TENANT_ID_REQUIRED" };

  const authenticated = await requireAuthenticatedUser(request);
  if (!authenticated.ok) return authenticated;

  const authorization = bearerToken(request);
  const { url, anonKey } = supabaseConfig();
  try {
    const response = await fetch(`${url}/rest/v1/rpc/tenant_membership_allowed`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization,
        "content-type": "application/json"
      },
      body: JSON.stringify({ target_tenant_id: tenantId })
    });
    if (!response.ok) return { ok: false, status: 403, message: "TENANT_ACCESS_DENIED" };
    const allowed = await response.json();
    return allowed === true
      ? authenticated
      : { ok: false, status: 403, message: "TENANT_ACCESS_DENIED" };
  } catch {
    return { ok: false, status: 503, message: "TENANT_AUTHORIZATION_UNAVAILABLE" };
  }
}
