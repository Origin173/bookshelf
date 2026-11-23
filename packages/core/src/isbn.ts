/** ISBN-13 check digit: alternating weights of 1 and 3, summing to a multiple of ten. */
function validIsbn13(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return sum % 10 === 0;
}

/** ISBN-10 check digit: descending weights, modulo eleven, with X for ten. */
function validIsbn10(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const digit = digits[i] === "X" ? 10 : Number(digits[i]);
    sum += digit * (10 - i);
  }
  return sum % 11 === 0;
}

/**
 * The first ISBN among some identifiers.
 *
 * `dc:identifier` holds whatever the publisher put there — a UUID, a URL, an
 * internal code — so candidates are checksummed rather than pattern-matched.
 * An unvalidated ten-digit run would happily turn an internal catalogue number
 * into an ISBN, and nothing downstream would know it was invented.
 */
export function findIsbn(values: readonly string[]): string | undefined {
  for (const value of values) {
    const candidates = value.matchAll(
      /\b(?:97[89][\d-]{10,14}|[\d-]{9,12}[\dX])\b/gi,
    );
    for (const candidate of candidates) {
      const digits = candidate[0].replace(/-/g, "").toUpperCase();
      if (
        digits.length === 13 &&
        /^\d{13}$/.test(digits) &&
        validIsbn13(digits)
      ) {
        return digits;
      }
      if (
        digits.length === 10 &&
        /^\d{9}[\dX]$/.test(digits) &&
        validIsbn10(digits)
      ) {
        return digits;
      }
    }
  }
  return undefined;
}
