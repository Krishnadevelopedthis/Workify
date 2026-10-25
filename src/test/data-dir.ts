// Runs before each test file: a private data folder per test worker, so test
// files that open the database in parallel never lock each other out.
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.WORKIFY_DATA_DIR ||= mkdtempSync(path.join(os.tmpdir(), "workify-test-data-"));
