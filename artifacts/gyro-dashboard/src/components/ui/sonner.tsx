"use client";

import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/hooks/use-theme";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      visibleToasts={1}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg font-mono text-xs",
          description: "group-[.toast]:text-muted-foreground text-[11px]",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          error:
            "group-[.toaster]:border-destructive/50 group-[.toaster]:bg-destructive/10",
          warning:
            "group-[.toaster]:border-amber-400/50 group-[.toaster]:bg-amber-400/10",
          closeButton:
            "group-[.toast]:bg-background group-[.toast]:text-foreground group-[.toast]:border-border",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
