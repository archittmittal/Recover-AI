import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],

  // getOrCreateDb() applies the Drizzle migrations at runtime by reading the .sql files from
  // src/lib/db/migrations via process.cwd(). Next's tracer only follows imports, so it cannot
  // see files opened by path — without this they are omitted from a standalone build and the
  // first database connection fails in production while working locally.
  outputFileTracingIncludes: {
    "/**": ["./src/lib/db/migrations/**/*"],
  },
};

export default nextConfig;
