import { connection, type NextRequest } from 'next/server';
import { logoutJavaSession } from '@/server/auth.server';

export async function POST(request: NextRequest) {
  await connection();
  return logoutJavaSession(request);
}
