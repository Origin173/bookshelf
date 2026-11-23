const MAX_NAMES = 20;

function parseNames(text: string, maxLength: number): string[] | null {
  const names = [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ];
  return names.length <= MAX_NAMES &&
    names.every((name) => name.length <= maxLength)
    ? names
    : null;
}

export function parseSubjects(text: string) {
  return parseNames(text, 80);
}

export function parseAuthors(text: string) {
  return parseNames(text, 200);
}

export function subjectAddition(subjects: string[], subject: string) {
  if (subjects.some((name) => name.trim() === subject)) return "subjectPresent";
  return subjects.length >= MAX_NAMES ? "subjectLimit" : "subjectToAdd";
}
