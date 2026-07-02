import { NextRequest, NextResponse } from "next/server"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  // Let API and static routes pass through untouched
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/")) {
    return NextResponse.next()
  }
  const token = request.cookies.get("datafun_token")?.value
  const isAuthPage = pathname.startsWith("/auth")
  if (!isAuthPage && !token) {
    return NextResponse.redirect(new URL("/auth/login", request.url))
  }
  if (isAuthPage && token) {
    return NextResponse.redirect(new URL("/", request.url))
  }
  return NextResponse.next()
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.ico|.*\\.webp).*)"] }
