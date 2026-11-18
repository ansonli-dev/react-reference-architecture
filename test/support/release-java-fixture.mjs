import { createServer } from 'node:http';

const book = {
  id: '00000000-0000-4000-8000-000000000101',
  title: 'Isolated release fixture',
  author: 'Fixture',
  category: 'Architecture',
  priceMinor: 4900,
  currency: 'CNY',
  stock: 5,
};

createServer((request, response) => {
  const { pathname, searchParams } = new URL(request.url, 'http://catalog');
  let data;
  if (request.method === 'GET') {
    if (pathname === '/api/v1/categories') {
      data = { categories: [book.category] };
    } else if (
      pathname === '/api/v1/books' &&
      searchParams.get('page') === '1' &&
      searchParams.get('size') === '12'
    ) {
      data = { page: 1, hasNext: false, books: [book] };
    }
  }
  if (!data) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(data));
}).listen(8081, '0.0.0.0');
