import 'server-only';
import { cookies, headers } from 'next/headers';
import { shopperIdSchema } from '@/features/checkout/model';
import { ApiFailure } from '@/shared/api/error';
import { runtimeConfig } from './config/runtime.server';
import { assertMutationOrigin } from './http/origin.server';

const shopperCookie = 'bookstore-shopper';

function configForShop() {
  if (process.env.BOOKSTORE_BUILD_PROFILE !== 'demo') {
    throw new ApiFailure('FORBIDDEN');
  }
  let config;
  try {
    config = runtimeConfig();
  } catch {
    throw new ApiFailure('CATALOG_UNAVAILABLE');
  }
  if (config.profile !== 'demo' || !config.dataDir) {
    throw new ApiFailure('CATALOG_UNAVAILABLE');
  }
  return { dataDir: config.dataDir, appOrigin: config.appOrigin };
}

async function openShop(dataDir: string) {
  const { createDemoDb } = await import('./adapters/demo/db.server');
  const { createDemoCheckout } =
    await import('./adapters/demo/checkout.server');
  return createDemoCheckout(
    createDemoDb(dataDir),
    createDemoDb(dataDir, { write: true }),
  );
}

export async function readDemoShop() {
  const jar = await cookies();
  const shopper = shopperIdSchema.safeParse(jar.get(shopperCookie)?.value).data;
  if (!shopper) return null;
  return { shopper, shop: await openShop(configForShop().dataDir) };
}

export async function demoShopMutation() {
  const { dataDir, appOrigin } = configForShop();
  assertMutationOrigin(await headers(), appOrigin);
  const jar = await cookies();
  const shopper = shopperIdSchema.safeParse(jar.get(shopperCookie)?.value).data;
  return {
    shopper,
    shop: await openShop(dataDir),
    rememberShopper(id: string) {
      jar.set(shopperCookie, id, {
        httpOnly: true,
        sameSite: 'lax',
        secure: appOrigin.startsWith('https:'),
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
    },
  };
}
