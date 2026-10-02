/**
 * Pure prefill adapter for `LeadCaptureForm`. Builds default form values from an
 * existing `GenesisNode` (the edit/prefill case) by reading `node.fieldValues`.
 *
 * Like `metrics/fromNodes.ts`, this NEVER fetches - call `getNodes` yourself and
 * pass the node in. Checkboxes coerce `'true'`/`'1'`/`'on'`/`'yes'` to `true`;
 * every other field coerces to a string, defaulting missing values to `''`.
 */
import type { GenesisNode } from '@/lib/genesis-data';

import type { LeadField } from './LeadCaptureForm';

const TRUTHY = new Set(['true', '1', 'on', 'yes']);

/**
 * Maps a node's stored field values onto the form's default values, keyed by
 * `field.name`. Returns one entry per field in `fields` so the form is fully
 * controlled from the first render.
 */
export function nodeToLeadDefaults(
  node: GenesisNode,
  fields: LeadField[],
): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {};
  const source = node.fieldValues ?? {};

  for (const field of fields) {
    const raw = source[field.name];
    if (field.type === 'checkbox') {
      values[field.name] = raw != null && TRUTHY.has(String(raw).toLowerCase());
    } else {
      values[field.name] = raw ?? '';
    }
  }

  return values;
}
