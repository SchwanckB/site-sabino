import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const { sessionId } = await auth();

    if (sessionId) {
      const client = await clerkClient();
      // Revoga a sessão no Clerk
      await client.sessions.revokeSession(sessionId);
    }
  } catch (error) {
    console.error('Erro ao fazer logout:', error);
  }

  // Redireciona para a home após logout
  return NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'), {
    status: 303,
  });
}
