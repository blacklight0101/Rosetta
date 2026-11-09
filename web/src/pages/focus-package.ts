// RF-1015 (P8-27): "Open the package" on the page of the plan run that wrote it scrolls to the
// package section (its downloads and the summary of checks.md) and moves the focus there, so the
// click does something the user can see.

export const packageSectionId = 'run-package';

/** Scrolls to and focuses the package section; false when the page has none (it is then opened). */
export function focusPackage(): boolean {
  const section = document.getElementById(packageSectionId);
  if (section === null) return false;
  if (typeof section.scrollIntoView === 'function') section.scrollIntoView({ block: 'start' });
  section.focus();
  return true;
}
