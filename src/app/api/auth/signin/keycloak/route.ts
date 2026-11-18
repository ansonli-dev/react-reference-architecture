import { connection, type NextRequest } from 'next/server';
import { startJavaLogin } from '@/server/auth.server';

export async function GET(request: NextRequest) {
  await connection();
  return startJavaLogin(request);
}
