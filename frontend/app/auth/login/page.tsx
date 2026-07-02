import Link from "next/link"
import Image from "next/image"
import LoginForm from "@/components/auth/LoginForm"

export default function LoginPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#07070f",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Canvas — uses .auth-canvas-img class so it inverts correctly per theme */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/datafun_canvas.png"
        alt=""
        className="auth-canvas-img"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
          pointerEvents: "none",
        }}
      />

      {/* Card — dark native so invert makes it light in light mode */}
      <div style={{
        position: "relative",
        zIndex: 1,
        background: "#0f0f1a",
        border: "1px solid #1e1e2e",
        borderRadius: "20px",
        padding: "36px 44px",
        width: "100%",
        maxWidth: "460px",
        boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      }}>
        <div style={{ marginBottom: "28px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}>
            <Image src="/logo.png" alt="DataFun" width={180} height={72} style={{ objectFit: "contain" }} priority />
          </div>
          <h1 style={{ fontSize: "20px", fontWeight: 600, color: "#f9fafb", margin: 0 }}>
            Welcome back
          </h1>
          <p style={{ color: "#9ca3af", marginTop: "8px", fontSize: "14px" }}>
            Log in to your account to continue
          </p>
        </div>
        <LoginForm />
        <p style={{ textAlign: "center", marginTop: "24px", color: "#9ca3af", fontSize: "14px" }}>
          Don&apos;t have an account?{" "}
          <Link href="/auth/signup" style={{ color: "#818cf8", fontWeight: 500 }}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
