import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export function SidePanel({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/60 z-40 animate-in fade-in" />
        <DialogPrimitive.Content
          className="fixed right-0 top-0 z-50 h-full w-full max-w-xl overflow-y-auto border-l border-border bg-bg-sidebar bg-bg p-6 shadow-2xl focus:outline-none"
        >
          <div className="flex items-center justify-between mb-4">
            <DialogPrimitive.Title className="text-lg font-bold text-text">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button className="text-text-muted hover:text-text rounded p-1" aria-label="Fechar">
                <X size={20} />
              </button>
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
