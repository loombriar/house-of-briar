/**
 * Pure adapters mapping a project's rows (`GenesisNode[]`) into block props.
 *
 * These read `node.fieldValues[...]` and coerce numbers with `Number()`. They do
 * NOT fetch data - call `getNodes` yourself and pass the result in. Keeping the
 * adapters pure means blocks stay presentational and these stay unit-testable.
 */
import type { GenesisNode } from '@/lib/genesis-data';

import type { GoalBarData } from './GoalBar';
import type { MetricCardData } from './MetricCard';

/**
 * Coerce a raw field string to a finite number, defaulting to 0. A missing field
 * (`undefined`) or a non-numeric value would otherwise yield `NaN`, which renders
 * literally as "NaN" in the goal label and `aria-valuenow`. Guarding here keeps the
 * presentational blocks free of defensive number-checks.
 */
function toFiniteNumber(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Maps node field paths onto `MetricCardData` props. */
export interface MetricsConfig {
  /** Field path read for the card's `label`. */
  labelField: string;
  /** Field path read for the card's `value`. */
  valueField: string;
  /** Optional field path read for the card's `change` text. */
  changeField?: string;
  /** Optional field path whose lowercased value `down` maps to a down trend. */
  trendField?: string;
  /** Chart token applied to every produced card. */
  colorIndex?: 1 | 2 | 3 | 4 | 5;
}

/** Maps node field paths onto `GoalBarData` props. */
export interface GoalsConfig {
  /** Field path read for the goal's `name`. */
  nameField: string;
  /** Field path read (and `Number()`-coerced) for `current`. */
  currentField: string;
  /** Field path read (and `Number()`-coerced) for `target`. */
  targetField: string;
  /** Chart token applied to every produced goal. */
  colorIndex?: 1 | 2 | 3 | 4 | 5;
}

export function nodesToMetrics(nodes: GenesisNode[], config: MetricsConfig): MetricCardData[] {
  return nodes.map((node) => {
    const fields = node.fieldValues;
    const rawTrend = config.trendField ? fields[config.trendField]?.toLowerCase() : undefined;
    return {
      label: fields[config.labelField] ?? '',
      value: fields[config.valueField] ?? '',
      change: config.changeField ? fields[config.changeField] : undefined,
      trend: rawTrend === 'up' || rawTrend === 'down' ? rawTrend : undefined,
      colorIndex: config.colorIndex,
    };
  });
}

export function nodesToGoals(nodes: GenesisNode[], config: GoalsConfig): GoalBarData[] {
  return nodes.map((node) => {
    const fields = node.fieldValues;
    return {
      name: fields[config.nameField] ?? '',
      current: toFiniteNumber(fields[config.currentField]),
      target: toFiniteNumber(fields[config.targetField]),
      colorIndex: config.colorIndex,
    };
  });
}
