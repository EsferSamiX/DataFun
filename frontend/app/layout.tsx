import type { Metadata } from "next"
import "./globals.css"
import { ThemeProvider } from "@/contexts/ThemeContext"

export const metadata: Metadata = {
  title: "DataFun",
  description: "AI-powered data profiling and model suggestions",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
