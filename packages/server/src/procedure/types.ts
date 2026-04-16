// ============================================
// Metadata helpers
// ============================================

export interface Metadata {
  keys?: string[];
  invalidate?: string[];
}

export function withMetadata<Output>(
  value: Output,
  metadata: Metadata
): Output & Metadata {
  return Object.assign({}, value, metadata);
}
