// Vercel serverless function — wraps TanStack Start's Fetch-API handler
// Runs at build-time output: dist/server/server.js

export default async function handler(req, res) {
  const { default: server } = await import('../dist/server/server.js');

  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const url = new URL(req.url, `${protocol}://${host}`);

  // Build Headers object from incoming Node.js request
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  const isBodyless = ['GET', 'HEAD'].includes(req.method || 'GET');

  const request = new Request(url.toString(), {
    method: req.method || 'GET',
    headers,
    ...(isBodyless ? {} : { body: req, duplex: 'half' }),
  });

  const response = await server.fetch(request);

  res.status(response.status);

  for (const [key, value] of response.headers.entries()) {
    // Avoid setting immutable headers
    if (key.toLowerCase() === 'transfer-encoding') continue;
    res.setHeader(key, value);
  }

  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  }

  res.end();
}
