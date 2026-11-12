import React from 'react';

interface ProgressBarProps {
  /** 0-100 */
  percent: number;
  label: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ percent, label }) => (
  <div
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={percent}
    className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden"
  >
    <div
      className={`h-full rounded-full transition-all ${percent >= 100 ? 'bg-emerald-500' : 'bg-teal-500'}`}
      style={{ width: `${percent}%` }}
    />
  </div>
);
