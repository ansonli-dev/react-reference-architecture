import { connection } from 'next/server';
import { probeCatalog } from '@/server/catalog.server';
import { apiJson } from '@/server/http/response.server';

export async function GET() {
  await connection();
  const reason = await probeCatalog();
  return reason === null
    ? apiJson({ status: 'ready' })
    : apiJson({ status: 'unavailable', reason }, 503);
}
