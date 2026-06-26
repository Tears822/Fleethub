/** Best-effort JSON error body from FleetHub API (or Fastify/nginx). */
export async function parseApiErrorResponse(
  res: Response,
): Promise<{ error?: string; message?: string }> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as { error?: string; message?: string };
  } catch {
    return {};
  }
}

export function apiErrorMessage(
  res: Response,
  data: { error?: string; message?: string },
  fallback: string,
  notFoundMessage: string,
): string {
  if (data.error) return data.error;
  if (data.message) return data.message;
  if (res.status === 404) {
    return notFoundMessage;
  }
  return fallback;
}
