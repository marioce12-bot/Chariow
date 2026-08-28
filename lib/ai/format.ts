const markdownFence = /```(?:markdown|md|text)?\s*([\s\S]*?)```/gi;

export function cleanAiText(value: string): string {
  return value
    .replace(markdownFence, "$1")
    .replace(/(^|\n)\s*```(?:markdown|md|text)?\s*/gi, "$1")
    .replace(/\s*```\s*(?=\n|$)/g, "")
    .replace(/\*{3,}/g, "")
    .replace(/(^|\s)\*{1,2}(?=\S)/g, "$1")
    .replace(/(?<=\S)\*{1,2}(?=\s|[.!?,;:]|$)/g, "")
    .replace(/\\([_*`#])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
