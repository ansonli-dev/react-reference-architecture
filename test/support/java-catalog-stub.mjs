import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { demoBooks } from '../../src/mocks/fixtures/catalog.ts';

export const javaStubOrigin = 'http://127.0.0.1:3212';
export const emptyCatalogPorts = { demo: 3213, release: 3214 };

const books = demoBooks.map((book) => ({
  ...book,
  title: 'Java fixture: ' + book.title,
}));
const categories = ['Architecture', 'Programming', 'Full shelf', 'Exact shelf'];

const exactShelf = books.slice(0, 12).map((book, i) => ({
  ...book,
  id: '00000000-0000-4000-8000-' + String(9001 + i).padStart(12, '0'),
  category: 'Exact shelf',
  title: 'Exact shelf book ' + (i + 1),
}));

export async function startJavaCatalogStub() {
  let scenario = {};
  const calls = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, javaStubOrigin);
    const json = (status, data) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(data));
    };
    if (url.pathname === '/__test/calls') return json(200, calls);
    if (url.pathname === '/__test/scenario' && request.method === 'PUT') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      scenario = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (scenario.resetCalls) calls.length = 0;
      response.writeHead(204).end();
      return;
    }

    calls.push({
      path: url.pathname + url.search,
      cookie: request.headers.cookie ?? null,
      authorization: request.headers.authorization ?? null,
    });
    const { mode, delayMs } = scenario;
    if (delayMs) await delay(delayMs);
    if (response.destroyed) return;
    if (mode === 'failure')
      return json(500, { message: 'private stub detail' });
    if (mode === 'broken') {
      response
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end('malformed json');
      return;
    }
    if (url.pathname === '/api/v1/categories') {
      return json(200, { categories });
    }
    const withStock = (book) =>
      book.id === books[0].id && scenario.firstBookStock !== undefined
        ? { ...book, stock: scenario.firstBookStock }
        : book;
    if (url.pathname === '/api/v1/books') {
      const page = Number(url.searchParams.get('page') ?? '1');
      const size = Number(url.searchParams.get('size') ?? '20');
      const category = url.searchParams.get('category');
      const keyword = url.searchParams.get('q')?.toLowerCase();
      if (category === 'Full shelf') {
        return json(200, {
          page,
          hasNext: true,
          books: Array.from({ length: size }, (_, i) => {
            const n = (page - 1) * size + i + 1;
            return {
              ...books[0],
              id:
                '00000000-0000-4000-8000-' +
                String(10000 + n).padStart(12, '0'),
              category,
              title: 'Archive book ' + n,
            };
          }),
        });
      }
      const batch = (category === 'Exact shelf' ? exactShelf : books).filter(
        (book) =>
          (!category || book.category === category) &&
          (!keyword ||
            [book.title, book.author].some((value) =>
              value.toLowerCase().includes(keyword),
            )),
      );
      const result = batch.slice((page - 1) * size, page * size).map(withStock);
      if (mode === 'unsafe' && result.length)
        result[0] = { ...result[0], priceMinor: 9007199254740992 };
      return json(200, {
        page,
        hasNext: batch.length > page * size,
        books: result,
      });
    }
    const book = [...books, ...exactShelf].find(
      ({ id }) => url.pathname === '/api/v1/books/' + id,
    );
    if (book) return json(200, withStock(book));
    return json(404, { message: 'private stub detail' });
  });
  server.listen(Number(new URL(javaStubOrigin).port), '127.0.0.1');
  await once(server, 'listening');
  return server;
}
