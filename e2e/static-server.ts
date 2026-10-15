import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** A real loopback origin whose build can change without changing its URL. */
export interface StaticOrigin {
  readonly url: string;
  serve(directory: string): void;
  stop(): Promise<void>;
}

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

/** Serve actual build files for service-worker upgrade tests, without response interception. */
export async function startStaticOrigin(directory: string): Promise<StaticOrigin> {
  let root = path.resolve(directory);
  const server = createServer((request, response) => {
    async function respond(): Promise<void> {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      const target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403); response.end(); return;
      }
      try {
        const body = await readFile(target);
        response.writeHead(200, {
          'Content-Type': contentTypes[path.extname(target)] ?? 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        response.end(body);
      } catch (error) {
        const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
        response.writeHead(missing ? 404 : 500); response.end();
      }
    }
    void respond().catch(() => { response.writeHead(400); response.end(); });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Static test origin did not bind a TCP port.');
  return {
    url: `http://127.0.0.1:${address.port}`,
    serve(next): void { root = path.resolve(next); },
    async stop(): Promise<void> {
      if (!server.listening) return;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    },
  };
}
