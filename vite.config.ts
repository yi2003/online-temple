import { defineConfig, loadEnv, type Plugin } from 'vite';

/** Serve api/temple.ts during `vite dev`, so login, sync and presence work locally. */
function localApi(): Plugin {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const mod = await server.ssrLoadModule('/api/temple.ts');
        const op = req.url.slice(5).split('?')[0];
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const request = new Request(`http://${req.headers.host}/api/temple?op=${op}`, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
        });
        const response: Response = await (req.method === 'POST' ? mod.POST : mod.GET)(request);
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    plugins: [localApi()],
    server: { host: true },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 900,
      rollupOptions: { output: { manualChunks: { three: ['three'] } } },
    },
  };
});
