import { describe, it, expect, vi } from "vitest";
import { parseHtml } from "./_dom";
import {
  fillField,
  runAssistedWrite,
  type AssistedField,
} from "../../../extension/lib/assisted-write";

// A minimal stand-in for LinkedIn's edit modal: a headline input, an about
// textarea, and a Save button inside a form. The assisted-write helper must
// target the right element, set its value, fire an input event so React/LinkedIn
// state updates, and NEVER submit the form or click Save on the user's behalf.
function editFormDoc(): Document {
  return parseHtml(`
    <body>
      <form id="edit-form" data-testid="edit-form">
        <input id="headline-input" data-field="headline" value="old headline" />
        <textarea id="about-input" data-field="about">old about</textarea>
        <button type="submit" data-testid="save-button">Save</button>
      </form>
    </body>
  `);
}

describe("fillField — targets the right element without submitting", () => {
  it("sets the new value on the targeted input after confirmation", () => {
    const doc = editFormDoc();
    const input = doc.querySelector<HTMLInputElement>("#headline-input")!;

    const result = fillField(doc, {
      selector: "#headline-input",
      label: "Headline",
      value: "new headline",
      confirm: () => true,
    });

    expect(result.ok).toBe(true);
    expect(input.value).toBe("new headline");
  });

  it("does NOT change the field when the user declines confirmation", () => {
    const doc = editFormDoc();
    const input = doc.querySelector<HTMLInputElement>("#headline-input")!;

    const result = fillField(doc, {
      selector: "#headline-input",
      label: "Headline",
      value: "new headline",
      confirm: () => false,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("declined");
    expect(input.value).toBe("old headline");
  });

  it("returns a not-found result when the selector matches nothing", () => {
    const doc = editFormDoc();
    const result = fillField(doc, {
      selector: "#does-not-exist",
      label: "Missing",
      value: "x",
      confirm: () => true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not_found");
  });

  it("dispatches an input event so the host app observes the change", () => {
    const doc = editFormDoc();
    const input = doc.querySelector<HTMLInputElement>("#headline-input")!;
    const onInput = vi.fn();
    input.addEventListener("input", onInput);

    fillField(doc, {
      selector: "#headline-input",
      label: "Headline",
      value: "new headline",
      confirm: () => true,
    });

    expect(onInput).toHaveBeenCalledTimes(1);
  });

  it("NEVER submits the surrounding form", () => {
    const doc = editFormDoc();
    const form = doc.querySelector<HTMLFormElement>("#edit-form")!;
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener("submit", onSubmit);

    fillField(doc, {
      selector: "#about-input",
      label: "About",
      value: "new about",
      confirm: () => true,
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("NEVER clicks the Save button", () => {
    const doc = editFormDoc();
    const save = doc.querySelector<HTMLButtonElement>('[data-testid="save-button"]')!;
    const onClick = vi.fn();
    save.addEventListener("click", onClick);

    fillField(doc, {
      selector: "#headline-input",
      label: "Headline",
      value: "new headline",
      confirm: () => true,
    });

    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("runAssistedWrite — field-by-field with per-field confirmation", () => {
  it("asks for confirmation once per field and applies only confirmed ones", () => {
    const doc = editFormDoc();
    const confirm = vi.fn((f: AssistedField) => f.label === "Headline");

    const fields: AssistedField[] = [
      { selector: "#headline-input", label: "Headline", value: "new headline" },
      { selector: "#about-input", label: "About", value: "new about" },
    ];

    const summary = runAssistedWrite(doc, fields, confirm);

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(summary.applied).toEqual(["Headline"]);
    expect(summary.skipped).toEqual(["About"]);

    expect(doc.querySelector<HTMLInputElement>("#headline-input")!.value).toBe(
      "new headline",
    );
    expect(doc.querySelector<HTMLTextAreaElement>("#about-input")!.value).toBe(
      "old about",
    );
  });

  it("never submits the form even when every field is confirmed", () => {
    const doc = editFormDoc();
    const form = doc.querySelector<HTMLFormElement>("#edit-form")!;
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener("submit", onSubmit);

    runAssistedWrite(
      doc,
      [
        { selector: "#headline-input", label: "Headline", value: "h" },
        { selector: "#about-input", label: "About", value: "a" },
      ],
      () => true,
    );

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
