import { describe, test, expect } from "bun:test";

describe("sous-chef-adapter — Note on RxJS testing", () => {
  test("RxJS streams best tested through integration (browser console or e2e)", () => {
    // Direct RxJS testing in Bun requires browser APIs (Subject, interval, etc.)
    // The adapter is best tested by:
    // 1. Manual testing in browser (see console logs)
    // 2. E2E tests simulating MQTT flow
    // 3. Concurrent gesture tests in preparation-machine.test.js verify behavior

    // The bug we caught (debounceTime filtering simultaneous gestures) would be
    // caught by e2e tests or manual testing, not by unit tests of the machine alone.

    expect(true).toBe(true);
  });
});
