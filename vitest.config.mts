import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "test/empty.ts") } },
  test: { environment: "node", env: { OPENROUTER_API_KEY: "", BLOB_READ_WRITE_TOKEN: "", KEEPER_DATA_DIR: path.resolve(__dirname, ".data-test") }, testTimeout: 20000 },
});
