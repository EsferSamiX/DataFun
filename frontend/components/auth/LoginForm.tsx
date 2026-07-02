"use client"

import { useState } from "react"
import { login } from "@/lib/api"
import { setToken } from "@/lib/auth"
import { useRouter } from "next/navigation"

function AuthInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      {...props}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e) }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e) }}
      style={{
        width: "100%",
        background: "#0f0f0f",
        border: `2px solid ${focused ? "#a5b4fc" : "#818cf8"}`,
        borderRadius: "8px",
        padding: "10px 14px",
        color: "#f9fafb",
        caretColor: "#f9fafb",
        fontSize: "15px",
        outline: "none",
        boxSizing: "border-box",
        transition: "border-color 0.15s",
        ...props.style,
      }}
    />
  )
}

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const { access_token } = await login({ email, password })
      setToken(access_token)
      router.push("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {error && (
        <div style={{
          background: "#3f1212",
          border: "1px solid #7f1d1d",
          borderRadius: "8px",
          padding: "12px",
          color: "#fca5a5",
          fontSize: "14px",
        }}>
          {error}
        </div>
      )}
      <div>
        <label style={{ display: "block", marginBottom: "6px", fontSize: "14px", color: "#9ca3af" }}>
          Email
        </label>
        <AuthInput
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <label style={{ display: "block", marginBottom: "6px", fontSize: "14px", color: "#9ca3af" }}>
          Password
        </label>
        <AuthInput
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        style={{
          background: loading ? "#4338ca" : "#6366f1",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          padding: "12px",
          fontSize: "15px",
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
          marginTop: "4px",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "Logging in..." : "Log in"}
      </button>
    </form>
  )
}
