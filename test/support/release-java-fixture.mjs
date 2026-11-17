import { createServer } from 'node:http';

createServer((request, response) => {
  const { pathname, searchParams } = new URL(request.url, 'http://catalog');
  if (
    request.method !== 'GET' ||
    pathname !== '/api/v1/books' ||
    searchParams.get('page') !== '0' ||
    searchParams.get('size') !== '12'
  ) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(
    JSON.stringify([
      {
        id: '00000000-0000-4000-8000-000000000101',
        title: 'Isolated release fixture',
        author: 'Fixture',
        category: 'Architecture',
        priceCents: 4900,
        currency: 'CNY',
        stock: 5,
      },
    ]),
  );
}).listen(8081, '0.0.0.0');
