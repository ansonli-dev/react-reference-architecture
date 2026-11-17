import { readDemoShop } from '@/server/demo-shop.server';
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
    const session = await readDemoShop();
    return apiJson(
      requireResource(session?.shop.submission(session.shopper, id)),
    );
  });
}
