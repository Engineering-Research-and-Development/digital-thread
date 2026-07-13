export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  database: {
    provider: process.env.DB_PROVIDER ?? 'sqlite',
    url: process.env.DATABASE_URL ?? 'file:./dev.db',
  },

  auth: {
    provider: process.env.AUTH_PROVIDER ?? 'jwt', // 'jwt' | 'keycloak'
    jwtSecret: process.env.JWT_SECRET ?? 'change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshTokenExpiresDays: parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? '7', 10),
    keycloak: {
      url: process.env.KEYCLOAK_URL,
      realm: process.env.KEYCLOAK_REALM,
      clientId: process.env.KEYCLOAK_CLIENT_ID,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
    },
  },

  storage: {
    provider: process.env.STORAGE_PROVIDER ?? 'fs', // 'fs' | 'minio'
    path: process.env.STORAGE_PATH ?? './storage',
    // One installation = one bucket (default `digital-thread`). On FS this
    // is the top-level directory; on MinIO it is the (single) S3 bucket. The
    // node/iteration grouping lives in the object path, not the bucket name.
    bucket: process.env.STORAGE_BUCKET ?? 'digital-thread',
    // Max decoded size accepted by POST /files/upload. Default 32 MB —
    // stays within the 50 MB Fastify bodyLimit once base64 inflation is applied.
    maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES ?? String(32 * 1024 * 1024), 10),
    minio: {
      endpoint: process.env.MINIO_ENDPOINT ?? 'localhost',
      port: parseInt(process.env.MINIO_PORT ?? '9000', 10),
      accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
      secure: process.env.MINIO_SECURE === 'true',
    },
  },
})
