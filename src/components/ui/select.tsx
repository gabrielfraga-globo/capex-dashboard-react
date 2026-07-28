import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Todos",
  className,
}: {
  value: string | null;
  onValueChange: (v: string | null) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <SelectPrimitive.Root
      value={value ?? "__all__"}
      onValueChange={(v) => onValueChange(v === "__all__" ? null : v)}
    >
      <SelectPrimitive.Trigger
        className={cn(
          "inline-flex items-center justify-between gap-2 rounded-md border border-border bg-card-alt px-3 py-1.5 text-xs text-text min-w-[150px] hover:border-accent transition-colors",
          className
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown size={14} className="text-text-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="z-50 max-h-64 overflow-y-auto rounded-md border border-border bg-card-alt shadow-card text-xs"
          position="popper"
          sideOffset={4}
        >
          <SelectPrimitive.Viewport className="p-1">
            <SelectPrimitive.Item
              value="__all__"
              className="flex items-center gap-2 rounded px-2 py-1.5 text-text-muted hover:bg-bg cursor-pointer outline-none data-[highlighted]:bg-bg"
            >
              <SelectPrimitive.ItemIndicator><Check size={12} /></SelectPrimitive.ItemIndicator>
              <SelectPrimitive.ItemText>{placeholder}</SelectPrimitive.ItemText>
            </SelectPrimitive.Item>
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-text hover:bg-bg cursor-pointer outline-none data-[highlighted]:bg-bg"
              >
                <SelectPrimitive.ItemIndicator><Check size={12} /></SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
