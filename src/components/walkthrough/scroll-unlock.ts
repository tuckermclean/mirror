/**
 * Scroll-to-unlock gate logic for the walkthrough commit button.
 *
 * Pure function so the unlock rule is unit-tested without a DOM. The component
 * wires a scroll listener and feeds it the live geometry.
 */

export interface ScrollGeometry {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

/** Pixels of slack allowed before the bottom still counts as "fully scrolled". */
export const DEFAULT_SCROLL_TOLERANCE_PX = 24;

/**
 * True when the user has scrolled to (or within `tolerance` px of) the bottom,
 * or when the content is short enough that there is nothing to scroll.
 */
export function isScrolledToEnd(
  geometry: ScrollGeometry,
  tolerance: number = DEFAULT_SCROLL_TOLERANCE_PX
): boolean {
  const { scrollTop, clientHeight, scrollHeight } = geometry;
  // Nothing to scroll — the whole page already fits in the viewport.
  if (scrollHeight <= clientHeight) return true;
  const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
  return distanceFromBottom <= tolerance;
}
