import { readDemoShop } from '@/server/demo-shop.server';
import { checkoutResponse } from '@/server/http/checkout.server';
import { apiJson } from '@/server/http/response.server';

export function GET() {
  return checkoutResponse(async () => {
    const session = await readDemoShop();
    return apiJson({ groups: session?.shop.cart(session.shopper) ?? [] });
  });
}
