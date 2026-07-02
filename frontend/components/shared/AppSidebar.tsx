"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { removeToken } from "@/lib/auth"
import { deleteProfile, getHistory, getMe, type HistoryItem } from "@/lib/api"
import { useTheme } from "@/contexts/ThemeContext"

function GradeBadge({ grade }: { grade: string | null | undefined }) {
  const map: Record<string, { bg: string; color: string }> = {
    A: { bg: "#052e16", color: "#22c55e" },
    B: { bg: "#0c1a35", color: "#60a5fa" },
    C: { bg: "#431407", color: "#fb923c" },
    D: { bg: "#450a0a", color: "#f87171" },
  }
  if (!grade || !map[grade]) return null
  const { bg, color } = map[grade]
  return (
    <span style={{
      background: bg, color,
      fontSize: "11px", fontWeight: 700, padding: "2px 7px",
      borderRadius: "5px", flexShrink: 0, letterSpacing: "0.03em",
    }}>
      {grade}
    </span>
  )
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: "44px", height: "24px", borderRadius: "12px",
        background: checked ? "#6366f1" : "#374151",
        cursor: "pointer", position: "relative",
        transition: "background 0.2s", flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute", top: "3px",
        left: checked ? "23px" : "3px",
        width: "18px", height: "18px", borderRadius: "50%",
        background: "#fff", transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
      }} />
    </div>
  )
}

export default function AppSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [userInitial, setUserInitial] = useState("U")

  const isLight = theme === "light"

  useEffect(() => {
    getHistory().then(setHistory).catch(() => {})
    getMe().then((u) => {
      const initial = u.full_name?.trim()?.[0]?.toUpperCase()
      if (initial) setUserInitial(initial)
    }).catch(() => {})
  }, [pathname])

  async function handleDelete(id: string) {
    await deleteProfile(id)
    setConfirmDeleteId(null)
    setHistory((prev) => prev.filter((h) => h.id !== id))
    if (pathname.endsWith(id)) router.push("/")
  }

  const activeId = pathname.startsWith("/pipeline/") ? pathname.split("/pipeline/")[1] : null

  function handleLogout() {
    removeToken()
    router.push("/auth/login")
  }

  return (
    <div style={{
      width: "248px", flexShrink: 0,
      background: "#0d0d0d",
      borderRight: "1px solid #1c1c1c",
      display: "flex", flexDirection: "column", height: "100vh",
    }}>
      {/* Logo */}
      <div style={{ padding: "16px 18px 14px", borderBottom: "1px solid #1c1c1c", flexShrink: 0 }}>
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
          <img src="/logo.png" alt="DataFun" style={{ height: "110px", width: "auto", maxWidth: "220px" }} />
        </Link>
      </div>

      {/* New Analysis */}
      <div style={{ padding: "14px 12px", flexShrink: 0 }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <div
            style={{
              display: "flex", alignItems: "center", gap: "10px",
              background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
              borderRadius: "10px", padding: "11px 14px",
              cursor: "pointer", transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            <span style={{ fontSize: "20px", color: "#fff", lineHeight: 1, fontWeight: 300 }}>+</span>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>New Analysis</div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", marginTop: "1px" }}>Upload a dataset</div>
            </div>
          </div>
        </Link>
      </div>

      {/* History */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 12px" }}>
        {history.length > 0 && (
          <div style={{
            fontSize: "12px", color: "#6b7280", fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase",
            margin: "4px 0 10px 4px",
          }}>
            Recent
          </div>
        )}
        {history.map((item) => {
          const isActive = item.id === activeId
          const href = `/pipeline/${item.id}`
          const isConfirming = confirmDeleteId === item.id
          return (
            <div key={item.id} style={{ marginBottom: "4px" }}>
              {isConfirming ? (
                <div style={{
                  padding: "10px 12px", borderRadius: "9px",
                  background: "#1a0a0a", border: "1px solid #7f1d1d",
                }}>
                  <div style={{ fontSize: "12px", color: "#fca5a5", marginBottom: "8px" }}>
                    Want to delete this analysis?
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => handleDelete(item.id)} style={{
                      flex: 1, padding: "5px 0", borderRadius: "6px",
                      background: "#7f1d1d", border: "1px solid #991b1b",
                      color: "#fca5a5", fontSize: "12px", cursor: "pointer", fontWeight: 600,
                    }}>Delete</button>
                    <button onClick={() => setConfirmDeleteId(null)} style={{
                      flex: 1, padding: "5px 0", borderRadius: "6px",
                      background: "transparent", border: "1px solid #374151",
                      color: "#9ca3af", fontSize: "12px", cursor: "pointer",
                    }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <Link href={href} style={{ textDecoration: "none" }}>
                  <div
                    style={{
                      padding: "10px 12px", borderRadius: "9px",
                      background: isActive ? "rgba(99,102,241,0.12)" : "transparent",
                      border: `1px solid ${isActive ? "#3730a3" : "transparent"}`,
                      cursor: "pointer", transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#161616" }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "4px" }}>
                      <span style={{ fontSize: "14px", flexShrink: 0 }}>📊</span>
                      <span style={{
                        fontSize: "14px", fontWeight: isActive ? 700 : 600,
                        color: isActive ? "#a5b4fc" : "#818cf8",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                      }}>
                        {item.file_name.replace(/\.[^.]+$/, "")}
                      </span>
                      <GradeBadge grade={item.quality_grade} />
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(item.id) }}
                        title="Delete"
                        style={{
                          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
                          borderRadius: "5px", padding: "3px 6px",
                          cursor: "pointer", color: "#f87171", fontSize: "12px",
                          lineHeight: 1, flexShrink: 0, transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.25)" }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.1)" }}
                      >🗑</button>
                    </div>
                    <div style={{ fontSize: "12px", color: "#6b7280", paddingLeft: "21px" }}>
                      {item.num_rows?.toLocaleString()} rows · {new Date(item.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </Link>
              )}
            </div>
          )
        })}
        {history.length === 0 && (
          <div style={{ padding: "32px 12px", textAlign: "center", color: "#6b7280", fontSize: "14px" }}>
            No analyses yet.<br />
            <span style={{ color: "#9ca3af" }}>Upload a dataset to start.</span>
          </div>
        )}
      </div>

      {/* Settings panel */}
      {settingsOpen && (
        <div style={{
          margin: "0 10px 8px",
          background: "#111", border: "1px solid #1f1f1f",
          borderRadius: "14px", padding: "16px", flexShrink: 0,
        }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#f9fafb", marginBottom: "14px" }}>
            ⚙ Settings
          </div>

          {/* Theme toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#f9fafb" }}>
                {isLight ? "☀️ Light mode" : "🌙 Dark mode"}
              </div>
              <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
                {isLight ? "Switch to dark" : "Switch to light"}
              </div>
            </div>
            <ToggleSwitch checked={isLight} onChange={toggleTheme} />
          </div>

          <div style={{ height: "1px", background: "#1f1f1f", marginBottom: "14px" }} />

          <button
            onClick={handleLogout}
            style={{
              width: "100%", background: "transparent",
              border: "1px solid #3b1a1a", borderRadius: "8px",
              padding: "9px 12px", color: "#f87171",
              fontSize: "13px", fontWeight: 600, cursor: "pointer",
              textAlign: "left", display: "flex", alignItems: "center", gap: "8px",
            }}
          >
            <span>↩</span> Log out
          </button>
        </div>
      )}

      {/* Footer: profile avatar */}
      <div style={{ padding: "12px 14px", borderTop: "1px solid #1c1c1c", flexShrink: 0 }}>
        <button
          onClick={() => setSettingsOpen((o) => !o)}
          style={{
            width: "100%",
            background: settingsOpen ? "#1a1a2e" : "#161616",
            border: `1px solid ${settingsOpen ? "#4338ca" : "#2a2a2a"}`,
            borderRadius: "10px", padding: "10px 14px",
            cursor: "pointer", display: "flex", alignItems: "center", gap: "10px",
            transition: "background 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => { if (!settingsOpen) { e.currentTarget.style.background = "#1f1f1f" } }}
          onMouseLeave={(e) => { if (!settingsOpen) { e.currentTarget.style.background = "#161616" } }}
        >
          <div style={{
            width: "32px", height: "32px", borderRadius: "50%",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, fontSize: "14px", fontWeight: 700, color: "#fff",
          }}>
            {userInitial}
          </div>
          <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#f9fafb", lineHeight: 1.3 }}>My Account</div>
            <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
              {isLight ? "☀️ Light mode" : "🌙 Dark mode"}
            </div>
          </div>
          <span style={{
            color: "#6b7280", fontSize: "13px",
            transition: "transform 0.2s",
            display: "inline-block",
            transform: settingsOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}>▲</span>
        </button>
      </div>
    </div>
  )
}
