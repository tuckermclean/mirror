/**
 * Unit test for migrate.mjs migration folder path resolution.
 *
 * Verifies that scripts/migrate.mjs uses the correct relative path
 * '../src/db/migrations' so that when the script runs from /app/scripts/,
 * the resolved path is /app/src/db/migrations (where the Dockerfile puts
 * the migrations), not /app/scripts/src/db/migrations (which does not exist).
 */
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/migrate.mjs');

describe('migrate.mjs migrations folder path resolution', () => {
  it('uses ../src/db/migrations (with leading ../) so the path resolves to the project root src/db/migrations', () => {
    const source = readFileSync(SCRIPT_PATH, 'utf-8');
    // The script must use '../src/db/migrations' not 'src/db/migrations'.
    // Without the leading '../', path.resolve('/app/scripts/', 'src/db/migrations')
    // yields '/app/scripts/src/db/migrations' which does not exist in the container.
    expect(source).toContain("'../src/db/migrations'");
  });

  it('does NOT use the bare src/db/migrations path that resolves inside the scripts directory', () => {
    const source = readFileSync(SCRIPT_PATH, 'utf-8');
    // Confirm the buggy path string is absent
    expect(source).not.toMatch(/'src\/db\/migrations'/);
  });

  it('confirms the resolved path arithmetic is correct', () => {
    // Simulate what the fixed script does inside the container.
    // script lives at /app/scripts/migrate.mjs → scriptDir = /app/scripts
    const scriptDir = '/app/scripts';
    const resolved = path.resolve(scriptDir, '../src/db/migrations');
    expect(resolved).toBe('/app/src/db/migrations');
  });
});
