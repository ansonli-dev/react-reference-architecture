import { parseOrdersPage } from '@/features/checkout/model';
import { checkoutResponse } from '@/server/http/checkout.server';
import { apiJson } from '@/server/http/response.server';
import { readShop } from '@/server/shop.server';
import { ApiFailure } from '@/shared/api/error';

export function GET(request: Request) {
  return checkoutResponse(async () => {
    const shop = await readShop();
    const params = new URL(request.url).searchParams;
    const page = parseOrdersPage(params.get('page') ?? undefined);
    if (params.getAll('page').length > 1 || page === undefined)
      throw new ApiFailure('INVALID_INPUT');
    return apiJson(await shop.orders(page));
  });
}
