import { orderSubmissionInput } from '@/features/checkout/model';
import { expireCatalogStock } from '@/server/catalog.server';
import { demoShopMutation } from '@/server/demo-shop.server';
import {
  checkoutResponse,
  checkoutResult,
  parseResourceId,
} from '@/server/http/checkout.server';
import { readJson } from '@/server/http/json.server';
import { apiJson } from '@/server/http/response.server';
import { ApiFailure } from '@/shared/api/error';

export function POST(request: Request) {
  return checkoutResponse(async () => {
    const { shopper, shop } = await demoShopMutation();
    const { quoteId } = await readJson(request, orderSubmissionInput);
    const key = parseResourceId(request.headers.get('Idempotency-Key'));
    if (!shopper) throw new ApiFailure('RESOURCE_NOT_FOUND');
    const { submission, created, bookIds } = checkoutResult(
      shop.submitQuote(shopper, quoteId, key),
    );
    expireCatalogStock(bookIds);
    return apiJson(submission, created ? 201 : 200, {
      Location: '/api/v1/order-submissions/' + submission.submissionId,
    });
  });
}
