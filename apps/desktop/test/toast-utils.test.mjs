import assert from "node:assert/strict";
import test from "node:test";

const { formatActionError } = await import(
  "../dist-server/src/state/toast-utils.js"
);

test("formatActionError prefixes the underlying error message", () => {
  assert.equal(
    formatActionError("Failed to switch branch", new Error("fatal: in use")),
    "Failed to switch branch: fatal: in use"
  );
});

test("formatActionError handles non-Error values and blanks", () => {
  assert.equal(
    formatActionError("Failed to switch branch", "plain string"),
    "Failed to switch branch: plain string"
  );
  assert.equal(
    formatActionError("Failed to switch branch", "   "),
    "Failed to switch branch: Unknown error"
  );
});
