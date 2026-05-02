"use client";

interface ScoreArcProps {
  score: number; // 0–100
  size?: number;
  strokeWidth?: number;
}

export default function ScoreArc({ score, size = 56, strokeWidth = 4 }: ScoreArcProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const center = size / 2;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="score-arc"
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--border-default)"
          strokeWidth={strokeWidth}
        />
        {/* Score arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--accent-cyan)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          style={{
            transition: "stroke-dashoffset 1s ease-out",
            filter: "drop-shadow(0 0 6px rgba(159, 231, 215, 0.32))",
          }}
        />
      </svg>
      <span
        className="absolute text-xs font-bold"
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--accent-cyan)",
        }}
      >
        {score}
      </span>
    </div>
  );
}
