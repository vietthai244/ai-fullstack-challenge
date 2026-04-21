// frontend/src/components/ui/sonner.tsx
//
// Phase 8 (UI-01): shadcn Sonner toast component.
// Mounted at root in App.tsx; renders toasts in Phase 9.
"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

type Theme = "light" | "dark" | "system"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()
  const resolvedTheme: Theme = (theme === "light" || theme === "dark" || theme === "system") ? theme : "system"

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
