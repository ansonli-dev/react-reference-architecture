import { connection } from 'next/server';
import { readCatalogCategories } from '@/server/catalog.server';
import { apiErrorResponse, apiJson } from '@/server/http/response.server';

export async function GET() {
  await connection();
  try {
    return apiJson({ categories: await readCatalogCategories() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
