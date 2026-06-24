// Vercel serverless entry. Kept as plain JS so Vercel doesn't re-transpile the
// NestJS source (which would drop decorator metadata and break DI). It loads the
// already-compiled app from `dist/` and forwards every request to Express.
const { bootstrapServer } = require('../dist/serverless');

let serverPromise;

module.exports = async (req, res) => {
  if (!serverPromise) serverPromise = bootstrapServer();
  const server = await serverPromise;
  return server(req, res);
};
