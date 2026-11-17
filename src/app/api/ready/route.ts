import { connection } from 'next/server';
import { runtimeConfig } from '@/server/config/runtime.server';

export async function GET() {
  await connection();
  let reason = 'CATALOG_NOT_CONFIGURED';
  try {
    const config = runtimeConfig();
    if (
      config.profile === 'demo' ? config.dataDir : config.javaCatalogBaseUrl
    ) {
      reason = 'CATALOG_UNAVAILABLE';
    }
  } catch {
    reason = 'CONFIG_INVALID';
  }
  return Response.json(
    { status: 'unavailable', reason },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
