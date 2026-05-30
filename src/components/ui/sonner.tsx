"use client"

import type { CSSProperties } from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as NonNullable<ToasterProps["theme"]>}
      className="toaster group"
      icons={{
        // Icons are decorative — aria-live region on the toast announces the
        // message text; aria-hidden prevents screen readers from reading the
        // SVG title alongside it (WCAG 1.1.1).
        success: <CircleCheckIcon className="size-4" aria-hidden="true" />,
        info:    <InfoIcon className="size-4" aria-hidden="true" />,
        warning: <TriangleAlertIcon className="size-4" aria-hidden="true" />,
        error:   <OctagonXIcon className="size-4" aria-hidden="true" />,
        loading: <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          // Styling hook for global toast overrides — define `.cn-toast` in
          // globals.css when project-wide toast styles are needed; no-op until
          // then (shadcn does not ship this class).
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
