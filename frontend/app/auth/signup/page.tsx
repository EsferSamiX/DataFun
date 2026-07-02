import Link from "next/link"
import Image from "next/image"
import SignUpForm from "@/components/auth/SignUpForm"

export default function SignUpPage() {
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
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
            <Image src="/logo.png" alt="DataFun" width={180} height={72} style={{ objectFit: "contain" }} priority />
          </div>
          <h1 style={{ fontSize: "20px", fontWeight: 600, color: "#f9fafb", margin: 0 }}>
            Create account
          </h1>
          <p style={{ color: "#9ca3af", marginTop: "8px", fontSize: "14px" }}>
            Start profiling your datasets
          </p>
        </div>
        <SignUpForm />
        <p style={{ textAlign: "center", marginTop: "24px", color: "#9ca3af", fontSize: "14px" }}>
          Already have an account?{" "}
          <Link href="/auth/login" style={{ color: "#818cf8", fontWeight: 500 }}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
