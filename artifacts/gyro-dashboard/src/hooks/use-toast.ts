import * as React from "react"
import { toast as sonnerToast } from "sonner"

// Single-surface bridge: this used to render its own <Toast> stack via a
// radix ToastProvider/Viewport, which ran alongside the Sonner toaster used
// by the alert system. Two independent toasters meant two toasts could be
// on screen at once for the same event. Now `toast()` forwards to Sonner
// (the single toast surface — see components/ui/sonner.tsx), which is
// configured to show only one toast at a time and dismisses the previous
// one before showing the next.
//
// This type intentionally does not reuse the retired radix ToastProps —
// it's a standalone contract for the legacy `{ title, description, variant }`
// call sites throughout the app.
type ToasterToast = {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: "default" | "destructive"
}

type Toast = Omit<ToasterToast, "id">

// Fixed id → each new toast replaces (rather than stacks with) the last one.
const SINGLE_TOAST_ID = "app-toast"

function toast({ title, description, variant, ...props }: Toast) {
  sonnerToast.dismiss(SINGLE_TOAST_ID)

  const emit = variant === "destructive" ? sonnerToast.error : sonnerToast
  emit(title as React.ReactNode, {
    id: SINGLE_TOAST_ID,
    description,
    duration: variant === "destructive" ? Infinity : 5000,
    ...props,
  })

  return {
    id: SINGLE_TOAST_ID,
    dismiss: () => sonnerToast.dismiss(SINGLE_TOAST_ID),
    update: (next: ToasterToast) => {
      sonnerToast(next.title as React.ReactNode, {
        id: SINGLE_TOAST_ID,
        description: next.description,
      })
    },
  }
}

function useToast() {
  return {
    toasts: [] as ToasterToast[],
    toast,
    dismiss: (toastId?: string) => sonnerToast.dismiss(toastId ?? SINGLE_TOAST_ID),
  }
}

export { useToast, toast }
