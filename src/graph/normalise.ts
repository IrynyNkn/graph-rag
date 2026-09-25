/**
 * Node identity. Ingest writes `Entity.name` through `normaliseName`, and query
 * looks nodes up through the same function — if the two sides ever disagree,
 * exact matching silently returns nothing. Keep them sharing this one place.
 */
export function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normaliseRelation(relation: string): string {
  return relation.trim().toUpperCase().replace(/\s+/g, '_');
}
