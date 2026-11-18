import 'server-only';
import { headers } from 'next/headers';
import type { Currency, OrderPage } from '@/features/checkout/model';
import { ApiFailure } from '@/shared/api/error';
import { createJavaCart } from './adapters/java/cart.server';
import { createJavaCatalog } from './adapters/java/catalog-v1.server';
import { javaDb } from './adapters/java/db.server';
import { createJavaOrder } from './adapters/java/order-v1.server';
import { readJavaSession } from './auth.server';
import { expireCatalogStock } from './catalog.server';
import { runtimeConfig } from './config/runtime.server';
import { demoShopMutation, readDemoShop } from './demo-shop.server';
import { checkoutResult } from './http/checkout.server';
import { assertMutationOrigin } from './http/origin.server';

export async function javaShop(mutation = false) {
  let config;
  try {
    config = runtimeConfig();
  } catch {
    throw new ApiFailure('CATALOG_UNAVAILABLE');
  }
  if (config.profile !== 'release') throw new ApiFailure('RESOURCE_NOT_FOUND');
  if (mutation) assertMutationOrigin(await headers(), config.appOrigin);

  const session = await readJavaSession();
  if (!session) throw new ApiFailure('UNAUTHENTICATED');
  const orders = createJavaOrder(config.javaOrderBaseUrl, session.accessToken);
  const cart = createJavaCart(
    javaDb(config.authDatabaseUrl),
    session.subject,
    createJavaCatalog(config.javaCatalogBaseUrl),
    orders,
  );
  return { ...orders, ...cart };
}

export async function readShop() {
  if (process.env.BOOKSTORE_BUILD_PROFILE !== 'demo') return await javaShop();
  const session = await readDemoShop();
  return {
    async cart() {
      return session?.shop.cart(session.shopper) ?? [];
    },
    async cartItem(bookId: string) {
      return session?.shop.cartItem(session.shopper, bookId) ?? null;
    },
    async quote(id: string) {
      return session?.shop.quote(session.shopper, id) ?? null;
    },
    async submission(id: string) {
      return session?.shop.submission(session.shopper, id) ?? null;
    },
    async orders(): Promise<OrderPage> {
      return { orders: session?.shop.orders(session.shopper) ?? [] };
    },
    async order(id: string) {
      return session?.shop.order(session.shopper, id) ?? null;
    },
  };
}

export async function mutateShop() {
  if (process.env.BOOKSTORE_BUILD_PROFILE !== 'demo') {
    const shop = await javaShop(true);
    return {
      ...shop,
      async submitQuote(quoteId: string, key: string) {
        const submission = await shop.submitQuote(quoteId, key);
        const terminal =
          submission.state === 'PLACED' || submission.state === 'REJECTED';
        return { submission, status: terminal ? 200 : 202 };
      },
    };
  }
  const { shop, shopper, rememberShopper } = await demoShopMutation();
  return {
    async setCartItem(
      bookId: string,
      quantity: number,
      matches: (etag: string | null) => boolean,
    ) {
      if (!quantity && !shopper) {
        if (!matches(null))
          throw new ApiFailure('CART_ITEM_PRECONDITION_FAILED');
        return { quantity, created: false };
      }
      const buyer = shopper ?? crypto.randomUUID();
      const result = checkoutResult(
        shop.setCartItem(buyer, bookId, quantity, matches),
      );
      if (!shopper) rememberShopper(buyer);
      return result;
    },
    async createQuote(currency: Currency, cartRevision: string) {
      if (!shopper) throw new ApiFailure('CART_EMPTY');
      return checkoutResult(shop.createQuote(shopper, currency, cartRevision));
    },
    async submitQuote(quoteId: string, key: string) {
      if (!shopper) throw new ApiFailure('RESOURCE_NOT_FOUND');
      const { submission, created, bookIds } = checkoutResult(
        shop.submitQuote(shopper, quoteId, key),
      );
      expireCatalogStock(bookIds);
      return { submission, status: created ? 201 : 200 };
    },
  };
}
