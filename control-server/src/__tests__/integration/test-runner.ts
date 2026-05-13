/**
 * Minimal test runner for integration tests.
 *
 * Provides `describe`, `it`, `before`, `after` functions that are
 * compatible with both vitest/jest (when available) and standalone execution.
 *
 * When vitest or jest is available, these functions are re-exported
 * from the framework. Otherwise, they are no-ops that allow test files
 * to run standalone with `npx tsx`.
 */

// Check if we're running inside vitest or jest
const hasVitest = typeof globalThis.describe === "function" && typeof globalThis.it === "function";

if (!hasVitest) {
  // Standalone mode: provide no-op implementations
  (globalThis as any).describe = (name: string, fn: () => void) => {
    console.log(`\nSuite: ${name}`);
    fn();
  };

  (globalThis as any).it = (name: string, fn: () => void | Promise<void>) => {
    // Tests are run manually in standalone mode
  };

  (globalThis as any).before = (fn: () => void | Promise<void>) => {
    fn();
  };

  (globalThis as any).after = (fn: () => void | Promise<void>) => {
    const origExit = process.exit;
    // Register cleanup
    process.on("exit", () => fn());
  };
}

// Re-export from the global scope
export const describe = (globalThis as any).describe as (name: string, fn: () => void) => void;
export const it = (globalThis as any).it as (name: string, fn: () => void | Promise<void>) => void;
export const before = (globalThis as any).before as (fn: () => void | Promise<void>) => void;
export const after = (globalThis as any).after as (fn: () => void | Promise<void>) => void;
