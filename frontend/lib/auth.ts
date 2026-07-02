export function getToken(): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(/(?:^|; )datafun_token=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : null
}

export function setToken(token: string): void {
  const maxAge = 60 * 60 * 24 // 24 hours
  document.cookie = `datafun_token=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; SameSite=Lax`
}

export function removeToken(): void {
  document.cookie = "datafun_token=; path=/; max-age=0; SameSite=Lax"
}

export function getAuthHeader(): Record<string, string> {
  const token = getToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}
