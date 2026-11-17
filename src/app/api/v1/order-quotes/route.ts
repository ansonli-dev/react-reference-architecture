import { quoteInput } from '@/features/checkout/model';
import { demoShopMutation } from '@/server/demo-shop.server';
import {
  checkoutResponse,
  checkoutResult,
} from '@/server/http/checkout.server';
import { readJson } from '@/server/http/json.server';
import { apiJson } from '@/server/http/response.server';
import { ApiFailure } from '@/shared/api/error';

export function POST(request: Request) {
  return checkoutResponse(async () => {
    const { shopper, shop } = await demoShopMutation();
    const { currency, cartRevision } = await readJson(request, quoteInput);
    if (!shopper) throw new ApiFailure('CART_EMPTY');
    const quote = checkoutResult(
      shop.createQuote(shopper, currency, cartRevision),
    );
    return apiJson(quote, 201, {
      Location: '/api/v1/order-quotes/' + quote.quoteId,
    });
  });
}
