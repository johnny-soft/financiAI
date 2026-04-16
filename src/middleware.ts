// Middleware disabled — auth is handled client-side in AppLayout
// This file is intentionally left minimal to avoid redirect loops

import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [],
}
