import assert from "node:assert/strict";
import test from "node:test";
import { getDatabaseConnectionString, isDatabaseConfigured } from "../lib/database";

test("database configuration prefers the pooled URL and accepts Neon unpooled fallback", () => {
  assert.equal(
    getDatabaseConnectionString({
      DATABASE_URL: "postgresql://pooled",
      DATABASE_URL_UNPOOLED: "postgresql://unpooled",
    }),
    "postgresql://pooled",
  );
  assert.equal(
    getDatabaseConnectionString({ DATABASE_URL_UNPOOLED: "postgresql://unpooled" }),
    "postgresql://unpooled",
  );
  assert.equal(isDatabaseConfigured({ DATABASE_URL_UNPOOLED: "postgresql://unpooled" }), true);
  assert.equal(isDatabaseConfigured({}), false);
  assert.throws(() => getDatabaseConnectionString({}), /DATABASE_URL or DATABASE_URL_UNPOOLED/);
});
