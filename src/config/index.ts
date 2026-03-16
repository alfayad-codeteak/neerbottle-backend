// App configuration – expand with env validation (e.g. Zod) when needed
export const config = () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
});
