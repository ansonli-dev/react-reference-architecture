import { parseBookId } from '@/features/catalog/model';
import { cartItemInput } from '@/features/checkout/model';
import { mutateShop, readShop } from '@/server/shop.server';
import {
  checkoutResponse,
  requireResource,
} from '@/server/http/checkout.server';
import { readJson } from '@/server/http/json.server';
import { apiJson } from '@/server/http/response.server';

type ItemRoute = RouteContext<'/api/v1/cart/items/[bookId]'>;

function itemConditions(headers: Headers) {
  const match = headers.get('If-Match');
  const none = headers.get('If-None-Match');
  return (etag: string | null) => {
    if (
      match !== null &&
      (etag === null ||
        !match.split(',').some((tag) => {
          const value = tag.trim();
          return value === '*' || value === etag;
        }))
    )
      return false;
    return (
      none === null ||
      etag === null ||
      !none.split(',').some((tag) => {
        const value = tag.trim();
        return value === '*' || value.replace(/^W\//, '') === etag;
      })
    );
  };
}

export function GET(_request: Request, { params }: ItemRoute) {
  return checkoutResponse(async () => {
    const id = parseBookId((await params).bookId);
    const shop = await readShop();
    const item = requireResource(await shop.cartItem(id));
    return apiJson({ bookId: id, quantity: item.quantity }, 200, {
      ETag: item.etag,
    });
  });
}

export function PUT(request: Request, { params }: ItemRoute) {
  return checkoutResponse(async () => {
    const id = parseBookId((await params).bookId);
    const shop = await mutateShop();
    const { quantity } = await readJson(request, cartItemInput);
    const result = await shop.setCartItem(
      id,
      quantity,
      itemConditions(request.headers),
    );
    const location = '/api/v1/cart/items/' + id;
    return apiJson(
      { bookId: id, quantity: result.quantity },
      result.created ? 201 : 200,
      result.created ? { Location: location } : undefined,
    );
  });
}

export function DELETE(request: Request, { params }: ItemRoute) {
  return checkoutResponse(async () => {
    const id = parseBookId((await params).bookId);
    const shop = await mutateShop();
    await shop.setCartItem(id, 0, itemConditions(request.headers));
    return new Response(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    });
  });
}
