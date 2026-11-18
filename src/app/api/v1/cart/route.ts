import { readShop } from '@/server/shop.server';
import { checkoutResponse } from '@/server/http/checkout.server';
import { apiJson } from '@/server/http/response.server';

export function GET() {
  return checkoutResponse(async () => {
    const shop = await readShop();
    return apiJson({ groups: await shop.cart() });
  });
}
