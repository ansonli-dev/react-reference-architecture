import 'server-only';
import postgres from 'postgres';

const pools = new Map<string, ReturnType<typeof postgres>>();

export function javaDb(databaseUrl: string) {
  let pool = pools.get(databaseUrl);
  if (!pool) {
    pool = postgres(databaseUrl, { connect_timeout: 5, idle_timeout: 30 });
    pools.set(databaseUrl, pool);
  }
  return pool;
}
