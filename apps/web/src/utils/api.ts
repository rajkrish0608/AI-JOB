import { createClient } from "@/utils/supabase/client"

/**
 * API helper that automatically attaches the Supabase JWT token
 * to all outgoing requests to the FastAPI backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"

/**
 * Get the current session's access token from Supabase.
 * Returns null if the user is not logged in.
 */
async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  } catch {
    return null
  }
}

/**
 * Wrapper around fetch() that automatically adds:
 * - The API base URL prefix
 * - The Authorization: Bearer <token> header
 * - Content-Type: application/json (for non-FormData bodies)
 *
 * @param path - API path (e.g., "/api/resume/generate")
 * @param options - Standard fetch options (method, body, etc.)
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken()

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  }

  // Add auth header if we have a token
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  // Add Content-Type for JSON bodies (skip for FormData)
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json"
  }

  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })
}
