/**
 * StatBar.tsx — Single stat bar with icon, label, fill, and colour thresholds (Phase 06).
 *
 * Colour: green (≥60) → amber (30-59) → red (<30), matching design-tokens.
 * Width: fill% = value/100 * 100%.
 */

import type { Component } from "solid-js";

export interface StatBarProps {
  /** Icon emoji for the stat (e.g. "🍗"). */
  icon: string;
  /** Stat label (e.g. "Hunger"). */
  label: string;
  /** Current value 0–100. */
  value: number;
}

/** Map stat value to CSS class for fill colour. */
function fillClass(value: number): string {
  if (value >= 60) return "stat-bar-fill";
  if (value >= 30) return "stat-bar-fill medium";
  return "stat-bar-fill low";
}

const StatBar: Component<StatBarProps> = (props) => {
  const pct = () => `${Math.max(0, Math.min(100, props.value))}%`;

  return (
    <div class="stat-row" role="group" aria-label={`${props.label}: ${props.value}`}>
      <span class="stat-icon" aria-hidden="true">{props.icon}</span>
      <span class="stat-label">{props.label}</span>
      <div class="stat-track" role="progressbar" aria-valuenow={props.value} aria-valuemin={0} aria-valuemax={100}>
        <div class={fillClass(props.value)} style={{ width: pct() }} />
      </div>
      <span class="stat-value">{props.value}</span>
    </div>
  );
};

export default StatBar;
