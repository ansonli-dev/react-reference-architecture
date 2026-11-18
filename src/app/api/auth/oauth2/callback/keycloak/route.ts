import { connection, type NextRequest } from 'next/server';
import { finishJavaLogin } from '@/server/auth.server';

export async function GET(request: NextRequest) {
  await connection();
  return finishJavaLogin(request);
}
