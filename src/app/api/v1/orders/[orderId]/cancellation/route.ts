import { orderCancellationInput } from '@/features/checkout/model';
import {
  checkoutResponse,
  parseResourceId,
} from '@/server/http/checkout.server';
import { readJson } from '@/server/http/json.server';
import { apiJson } from '@/server/http/response.server';
import { javaShop } from '@/server/shop.server';

type Props = RouteContext<'/api/v1/orders/[orderId]/cancellation'>;

export function GET(_request: Request, { params }: Props) {
  return checkoutResponse(async () => {
    const shop = await javaShop();
    const id = parseResourceId((await params).orderId);
    return apiJson(await shop.cancellation(id));
  });
}

export function PUT(request: Request, { params }: Props) {
  return checkoutResponse(async () => {
    const shop = await javaShop(true);
    const id = parseResourceId((await params).orderId);
    const input = await readJson(request, orderCancellationInput);
    const { data, status } = await shop.cancel(id, input);
    return apiJson(data, status, {
      Location: '/api/v1/orders/' + id + '/cancellation',
    });
  });
}
