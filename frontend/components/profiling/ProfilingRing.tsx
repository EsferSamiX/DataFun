"use client"

interface ProfilingRingProps {
  status: "pending" | "running" | "done"
  size?: number
}

export default function ProfilingRing({ status, size = 48 }: ProfilingRingProps) {
  const r = (size / 2) - 5
  const circumference = 2 * Math.PI * r

  if (status === "done") {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#22c55e"
          strokeWidth="3"
        />
        {/* checkmark */}
        <polyline
          points={`${size * 0.3},${size * 0.52} ${size * 0.45},${size * 0.65} ${size * 0.7},${size * 0.38}`}
          fill="none"
          stroke="#22c55e"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (status === "running") {
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="spinning-ring"
        style={{ animation: "rotate 1s linear infinite", transformOrigin: "center" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#2a2a2a"
          strokeWidth="3"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#6366f1"
          strokeWidth="3"
          strokeDasharray={`${circumference * 0.25} ${circumference * 0.75}`}
          strokeLinecap="round"
        />
      </svg>
    )
  }

  // pending
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#2a2a2a"
        strokeWidth="3"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={3}
        fill="#3f3f46"
      />
    </svg>
  )
}
