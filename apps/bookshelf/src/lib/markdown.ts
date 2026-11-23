export function markdownText(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([\\`*_[\]#<>|~])/g, "\\$1");
}
