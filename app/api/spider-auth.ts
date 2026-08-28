const FIREBASE_API_KEY = "AIzaSyB4EjMAMRx3P0yT3YKhD7YV06rPfZSCtkQ";
export type SpiderAccount = { localId?: string; displayName?: string };

export async function spiderAccount(request: Request): Promise<SpiderAccount | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!idToken) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { users?: SpiderAccount[] };
  return data.users?.[0] ?? null;
}
