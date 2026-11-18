import { orderSubmissionInput } from '@/features/checkout/model';
import { mutateShop } from '@/server/shop.server';
import {
  checkoutResponse,
  parseResourceId,
} from '@/server/http/checkout.server';
import { readJson } from '@/server/http/json.server';
import { apiJson } from '@/server/http/response.server';

export function POST(request: Request) {
  return checkoutResponse(async () => {
    const shop = await mutateShop();
    const { quoteId } = await readJson(request, orderSubmissionInput);
    const key = parseResourceId(request.headers.get('Idempotency-Key'));
    const { submission, status } = await shop.submitQuote(quoteId, key);
    return apiJson(submission, status, {
      Location: '/api/v1/order-submissions/' + submission.submissionId,
    });
  });
}
