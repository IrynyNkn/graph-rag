import type { RetrievedPath } from './retriever.js';

/**
 * The same chain is found once from each end, and every prefix of a chain is found as a path of
 * its own. Both waste the context budget without adding a fact. Ported from QASA.
 */
export function deduplicatePaths(paths: RetrievedPath[]): RetrievedPath[] {
  const candidates = removeReversedDuplicates(paths);
  return candidates.filter(
    (path) => !candidates.some((other) => isContainedIn(namesOf(path), namesOf(other))),
  );
}

function removeReversedDuplicates(paths: RetrievedPath[]): RetrievedPath[] {
  const seen = new Set<string>();
  return paths.filter((path) => {
    const names = namesOf(path);
    const key = JSON.stringify(names);
    if (seen.has(key) || seen.has(JSON.stringify(names.toReversed()))) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function namesOf(path: RetrievedPath): string[] {
  return path.nodes.map((node) => node.name);
}

function isContainedIn(short: string[], long: string[]): boolean {
  if (short.length >= long.length) {
    return false;
  }
  const reversed = short.toReversed();
  return (
    short.every((name, index) => long[index] === name) ||
    reversed.every((name, index) => long[long.length - short.length + index] === name)
  );
}
