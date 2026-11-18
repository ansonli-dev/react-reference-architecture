import { readShop } from '@/server/shop.server';
import {
  checkoutResponse,
  parseResourceId,
  requireResource,
} from '@/server/http/checkout.server';
import { apiJson } from '@/server/http/response.server';

export function GET(
  _request: Request,
  { params }: RouteContext<'/api/v1/order-submissions/[submissionId]'>,
) {
  return checkoutResponse(async () => {
    const id = parseResourceId((await params).submissionId);
    const shop = await readShop();
    return apiJson(requireResource(await shop.submission(id)));
  }, 'api.checkout.submission.read');
}
