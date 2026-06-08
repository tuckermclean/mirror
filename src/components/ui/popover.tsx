"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root {...props} />
}

function PopoverTrigger(
  props: React.ComponentProps<typeof PopoverPrimitive.Trigger>
) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 8,
  children,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Popup> & {
  align?: "start" | "center" | "end"
  sideOffset?: number
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner align={align} sideOffset={sideOffset}>
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-50 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-4 text-sm text-popover-foreground shadow-md outline-none",
            "data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            className
          )}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

const PopoverTitle = PopoverPrimitive.Title
const PopoverDescription = PopoverPrimitive.Description
const PopoverClose = PopoverPrimitive.Close

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
  PopoverDescription,
  PopoverClose,
}
