import path from "node:path";

export const MIGRATIONS_FOLDER = path.resolve(/* turbopackIgnore: true */ process.cwd(), "src/db/migrations");
