"use strict";
module.exports = ({ env }) => {
  const url = env("DATABASE_URL");
  if (!url || !/^postgres(ql)?:\/\//.test(url))
    throw new Error("A dedicated Strapi PostgreSQL DATABASE_URL is required");
  const database = new URL(url).pathname.slice(1);
  // Deliberate safety interlock: never run schema sync against the legacy database.
  if (!database.startsWith("alageum_strapi"))
    throw new Error(
      "DATABASE_URL must identify an isolated alageum_strapi* database; do not reuse the legacy database",
    );
  return {
    connection: {
      client: "postgres",
      connection: {
        connectionString: url,
        schema: "public",
        ssl: ["1", "true"].includes(env("DATABASE_SSL", "false"))
          ? { rejectUnauthorized: true }
          : false,
      },
      pool: { min: 0, max: 10 },
    },
  };
};
