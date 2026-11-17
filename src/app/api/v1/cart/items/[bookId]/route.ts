import { parseBookId } from '@/features/catalog/model';
import { cartItemInput } from '@/features/checkout/model';
import { demoShopMutation, readDemoShop } from '@/server/demo-shop.server';
import {
  checkoutResponse,
  checkoutResult,
  requireResource,
} from '@/server/http/checkout.server';
import { readJson } from '@/server/http/json.server';
import { apiJson } from '@/server/http/response.server';
import { ApiFailure } from '@/shared/api/error';

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
    const session = await readDemoShop();
    const item = requireResource(session?.shop.cartItem(session.shopper, id));
    return apiJson({ bookId: id, quantity: item.quantity }, 200, {
      ETag: item.etag,
    });
  });
}

export function PUT(request: Request, { params }: ItemRoute) {
  return checkoutResponse(async () => {
    const id = parseBookId((await params).bookId);
    const { shopper, shop, rememberShopper } = await demoShopMutation();
    const { quantity } = await readJson(request, cartItemInput);
    const buyer = shopper ?? crypto.randomUUID();
    const result = checkoutResult(
      shop.setCartItem(buyer, id, quantity, itemConditions(request.headers)),
    );
    if (!shopper) rememberShopper(buyer);
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
    const { shopper, shop } = await demoShopMutation();
    const matches = itemConditions(request.headers);
    if (shopper) checkoutResult(shop.setCartItem(shopper, id, 0, matches));
    else if (!matches(null))
      throw new ApiFailure('CART_ITEM_PRECONDITION_FAILED');
    return new Response(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    });
  });
}
