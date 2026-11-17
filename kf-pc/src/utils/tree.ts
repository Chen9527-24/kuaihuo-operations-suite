export function flattenTree<T extends { children?: T[] }>(tree: T[]): T[] {
  return tree.flatMap((item) => [item, ...flattenTree(item.children ?? [])]);
}
