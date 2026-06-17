/**
 * assisted-write — fill LinkedIn's edit UI field-by-field, with the user
 * confirming every single field, and NEVER auto-submitting.
 *
 * HONESTY (SPEC §8): there is no third-party LinkedIn profile-edit API. The
 * only legitimate path is to assist the user inside LinkedIn's own edit UI:
 * we set the value of the field they are looking at, fire an `input` event so
 * LinkedIn's React state observes the change, and then stop. The user reviews
 * and clicks Save themselves. This module deliberately never calls
 * `form.submit()`, never clicks a Save/submit button, and never dispatches a
 * `submit` event.
 */

/** A single field the user may choose to apply into LinkedIn's edit UI. */
export interface AssistedField {
  /** CSS selector for the editable input/textarea in LinkedIn's edit modal. */
  selector: string;
  /** Human-readable label shown in the confirmation prompt (e.g. "Headline"). */
  label: string;
  /** The accepted value to write into the field. */
  value: string;
  /**
   * Per-field confirmation gate. Returns true to apply, false to skip.
   * Optional on the type so callers can supply confirmation centrally via
   * {@link runAssistedWrite}; {@link fillField} requires it.
   */
  confirm?: (field: AssistedField) => boolean;
}

export type FillFailureReason = "declined" | "not_found" | "not_editable";

export type FillResult =
  | { ok: true; label: string }
  | { ok: false; reason: FillFailureReason; label: string };

type EditableElement = HTMLInputElement | HTMLTextAreaElement;

type AsEditableResult =
  | { found: false }
  | { found: true; editable: false }
  | { found: true; editable: true; el: EditableElement };

/**
 * Duck-typed editability check that works across realms (happy-dom's element
 * classes are not the global `HTMLInputElement`, so `instanceof` against the
 * global is unreliable). We accept INPUT and TEXTAREA elements that expose a
 * string `value`.
 *
 * Returns a discriminated result so callers can distinguish "not found" from
 * "found but wrong tag/type" — enabling `FillFailureReason "not_editable"`.
 */
function asEditable(el: Element | null): AsEditableResult {
  if (!el) return { found: false };
  const tag = el.tagName?.toUpperCase();
  if (tag !== "INPUT" && tag !== "TEXTAREA") return { found: true, editable: false };
  if (typeof (el as { value?: unknown }).value !== "string") return { found: true, editable: false };
  return { found: true, editable: true, el: el as EditableElement };
}

/**
 * Set a native input/textarea value using React's tracked prototype setter when
 * present, so controlled components register the change, then dispatch a single
 * bubbling `input` event. Never touches form submission.
 */
function setValueAndNotify(el: EditableElement, value: string): void {
  const view = el.ownerDocument?.defaultView as
    | (Window & typeof globalThis)
    | undefined;
  const ctor =
    el.tagName.toUpperCase() === "TEXTAREA"
      ? view?.HTMLTextAreaElement
      : view?.HTMLInputElement;
  const descriptor = ctor
    ? Object.getOwnPropertyDescriptor(ctor.prototype, "value")
    : undefined;
  if (descriptor?.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }
  const EventCtor = view?.Event ?? globalThis.Event;
  el.dispatchEvent(new EventCtor("input", { bubbles: true }));
}

/**
 * Fill one field after explicit user confirmation. Returns a typed result;
 * never throws for expected outcomes (declined / not found).
 */
export function fillField(
  doc: Document,
  field: Required<Pick<AssistedField, "confirm">> & AssistedField,
): FillResult {
  const result = asEditable(doc.querySelector(field.selector));
  if (!result.found) return { ok: false, reason: "not_found", label: field.label };
  if (!result.editable) return { ok: false, reason: "not_editable", label: field.label };

  if (!field.confirm(field)) {
    return { ok: false, reason: "declined", label: field.label };
  }

  setValueAndNotify(result.el, field.value);
  return { ok: true, label: field.label };
}

export interface AssistedWriteSummary {
  /** Labels of fields the user confirmed and that were written. */
  applied: string[];
  /** Labels the user declined or that could not be found. */
  skipped: string[];
}

/**
 * Walk the accepted fields one at a time, asking the supplied `confirm`
 * callback per field. Applies only confirmed fields. NEVER submits the form.
 */
export function runAssistedWrite(
  doc: Document,
  fields: AssistedField[],
  confirm: (field: AssistedField) => boolean,
): AssistedWriteSummary {
  const summary: AssistedWriteSummary = { applied: [], skipped: [] };
  for (const field of fields) {
    const result = fillField(doc, { ...field, confirm });
    if (result.ok) summary.applied.push(result.label);
    else summary.skipped.push(result.label);
  }
  return summary;
}
