"use client"

import { useState } from "react"

interface StarterCodeBlockProps {
  code: string
  language?: string
}

export default function StarterCodeBlock({ code, language = "python" }: StarterCodeBlockProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{
      background: "#0f0f0f",
      border: "1px solid #2a2a2a",
      borderRadius: "8px",
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 14px",
        borderBottom: "1px solid #2a2a2a",
        background: "#161616",
      }}>
        <span style={{ color: "#9ca3af", fontSize: "12px" }}>{language}</span>
        <button
          onClick={handleCopy}
          style={{
            background: "none",
            border: "1px solid #2a2a2a",
            borderRadius: "4px",
            padding: "3px 10px",
            color: copied ? "#22c55e" : "#9ca3af",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre style={{
        margin: 0,
        padding: "16px",
        overflowX: "auto",
        fontFamily: "'Fira Code', 'JetBrains Mono', 'Courier New', monospace",
        fontSize: "13px",
        lineHeight: 1.6,
        color: "#e2e8f0",
        whiteSpace: "pre",
      }}>
        <code>{code}</code>
      </pre>
    </div>
  )
}
