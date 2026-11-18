import { quoteInput } from '@/features/checkout/model';
import { mutateShop } from '@/server/shop.server';
import { checkoutResponse } from '@/server/http/checkout.server';
import { readJson } from '@/server/http/json.server';
import { apiJson } from '@/server/http/response.server';

export function POST(request: Request) {
  return checkoutResponse(async () => {
    const shop = await mutateShop();
    const { currency, cartRevision } = await readJson(request, quoteInput);
    const quote = await shop.createQuote(currency, cartRevision);
    return apiJson(quote, 201, {
      Location: '/api/v1/order-quotes/' + quote.quoteId,
    });
  });
}
