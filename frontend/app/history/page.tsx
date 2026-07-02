"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getHistory } from "@/lib/api"
import type { HistoryItem } from "@/lib/api"
import GradeBadge from "@/components/shared/GradeBadge"
import { removeToken } from "@/lib/auth"

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default function HistoryPage() {
  const router = useRouter()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    getHistory()
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = items.filter((item) =>
    item.file_name.toLowerCase().includes(search.toLowerCase())
  )

  function handleLogout() {
    removeToken()
    router.push("/auth/login")
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f0f" }}>
      {/* Top bar */}
      <div style={{
        background: "#1a1a1a",
        borderBottom: "1px solid #2a2a2a",
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link href="/" style={{ fontSize: "20px", fontWeight: 700, color: "#fff" }}>DataFun</Link>
          <h1 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#e5e7eb" }}>History</h1>
        </div>
        <button
          onClick={handleLogout}
          style={{ background: "none", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "6px 12px", color: "#9ca3af", cursor: "pointer", fontSize: "14px" }}
        >
          Log out
        </button>
      </div>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px 20px" }}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search by filename..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            background: "#1a1a1a",
            border: "1px solid #2a2a2a",
            borderRadius: "8px",
            padding: "10px 14px",
            color: "#fff",
            fontSize: "15px",
            outline: "none",
            marginBottom: "20px",
          }}
        />

        {loading && (
          <div style={{ textAlign: "center", color: "#9ca3af", padding: "40px" }}>
            Loading history...
          </div>
        )}

        {error && (
          <div style={{ color: "#ef4444", textAlign: "center", padding: "20px" }}>
            Error: {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "#9ca3af", padding: "60px 20px" }}>
            <div style={{ fontSize: "40px", marginBottom: "16px" }}>📂</div>
            <p>{search ? "No profiles match your search." : "No past profiles yet. Upload a dataset to get started."}</p>
            <Link href="/" style={{ color: "#6366f1", marginTop: "12px", display: "inline-block" }}>
              Upload a dataset →
            </Link>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{
            background: "#1a1a1a",
            border: "1px solid #2a2a2a",
            borderRadius: "12px",
            overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #2a2a2a", background: "#161616" }}>
                  {["Filename", "Date", "Rows", "Columns", "Grade"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "12px 16px", color: "#9ca3af", fontWeight: 500, fontSize: "13px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => router.push(`/pipeline/${item.id}`)}
                    style={{
                      borderBottom: "1px solid #1f1f1f",
                      cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#1f1f1f")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "14px 16px", color: "#e5e7eb", fontWeight: 500 }}>
                      📄 {item.file_name}
                    </td>
                    <td style={{ padding: "14px 16px", color: "#9ca3af" }}>{formatDate(item.created_at)}</td>
                    <td style={{ padding: "14px 16px", color: "#9ca3af" }}>{item.num_rows.toLocaleString()}</td>
                    <td style={{ padding: "14px 16px", color: "#9ca3af" }}>{item.num_columns}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <GradeBadge grade={item.quality_grade} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
