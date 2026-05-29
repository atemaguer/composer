import assert from "node:assert/strict";
import test from "node:test";

const { addToast, formatActionError } = await import(
  "../dist-server/src/state/toast-utils.js"
);

test("addToast appends a new toast", () => {
  const next = addToast([], { id: "a", message: "boom", tone: "error" });
  assert.deepEqual(next, [{ id: "a", message: "boom", tone: "error" }]);
});

test("addToast de-duplicates identical message + tone", () => {
  const existing = [{ id: "a", message: "boom", tone: "error" }];
  const next = addToast(existing, { id: "b", message: "boom", tone: "error" });

  // The old identical toast is dropped; only the newest remains.
  assert.deepEqual(next, [{ id: "b", message: "boom", tone: "error" }]);
});

test("addToast keeps toasts that differ by tone", () => {
  const existing = [{ id: "a", message: "boom", tone: "error" }];
  const next = addToast(existing, { id: "b", message: "boom", tone: "info" });

  assert.equal(next.length, 2);
});

test("addToast caps the number of visible toasts to the most recent", () => {
  let toasts = [];
  for (let index = 0; index < 7; index += 1) {
    toasts = addToast(
      toasts,
      { id: `t${index}`, message: `msg ${index}`, tone: "error" },
      4
    );
  }

  assert.equal(toasts.length, 4);
  assert.deepEqual(
    toasts.map((toast) => toast.id),
    ["t3", "t4", "t5", "t6"]
  );
});

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
