import { Check, ChevronDown } from "lucide-react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type SelectOption<TValue extends string = string> = {
  value: TValue
  label: ReactNode
  disabled?: boolean
}

type SelectProps<TValue extends string = string> = {
  value: TValue
  onValueChange: (value: TValue) => void
  options: ReadonlyArray<SelectOption<TValue>>
  ariaLabel: string
  placeholder?: ReactNode
  disabled?: boolean
  name?: string
  className?: string
  triggerClassName?: string
  popupClassName?: string
  itemClassName?: string
}

function Select<TValue extends string = string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  placeholder = "Select",
  disabled,
  name,
  className,
  triggerClassName,
  popupClassName,
  itemClassName
}: SelectProps<TValue>) {
  const selectedOption = options.find((option) => option.value === value)

  return (
    <SelectPrimitive.Root<TValue>
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue !== null) {
          onValueChange(nextValue)
        }
      }}
      disabled={disabled}
      name={name}
    >
      <div data-slot="select" className={cn("relative", className)}>
        <SelectPrimitive.Trigger
          data-slot="select-trigger"
          aria-label={ariaLabel}
          className={cn(
            "inline-flex h-8 min-w-[190px] max-w-[360px] items-center justify-between gap-2 rounded-lg border border-app-line bg-app-panel/70 px-3 text-[14px] text-app-muted outline-none transition-colors",
            "hover:border-app-line-bright hover:bg-app-text/[0.06] hover:text-app-text",
            "focus-visible:border-app-blue/60 focus-visible:ring-2 focus-visible:ring-app-blue/25",
            "data-disabled:cursor-default data-disabled:opacity-50",
            triggerClassName
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder}>
            {() => (
              <span className="min-w-0 truncate text-left">
                {selectedOption?.label ?? placeholder}
              </span>
            )}
          </SelectPrimitive.Value>
          <SelectPrimitive.Icon
            className="shrink-0 text-app-dim"
            render={<ChevronDown size={13} aria-hidden="true" />}
          />
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Positioner
            sideOffset={6}
            alignItemWithTrigger={false}
            className="z-50"
          >
            <SelectPrimitive.Popup
              data-slot="select-popup"
              className={cn(
                "max-h-[min(420px,var(--available-height))] min-w-[max(var(--anchor-width),280px)] overflow-y-auto overflow-x-hidden rounded-lg border border-app-line bg-app-panel-2/98 p-1 shadow-[0_18px_48px_color-mix(in_srgb,var(--color-app-bg)_42%,transparent)] outline-none backdrop-blur",
                popupClassName
              )}
            >
              <SelectPrimitive.List>
                {options.map((option) => (
                  <SelectPrimitive.Item
                    key={option.value}
                    value={option.value}
                    label={typeof option.label === "string" ? option.label : undefined}
                    disabled={option.disabled}
                    className={cn(
                      "grid min-h-8 min-w-0 cursor-default grid-cols-[20px_minmax(0,1fr)] items-center gap-2 rounded-md px-2 text-[14px] text-app-muted outline-none",
                      "data-highlighted:bg-app-text/[0.08] data-highlighted:text-app-text",
                      "data-disabled:opacity-45",
                      itemClassName
                    )}
                  >
                    <SelectPrimitive.ItemIndicator className="col-start-1 row-start-1 text-app-blue">
                      <Check size={13} aria-hidden="true" />
                    </SelectPrimitive.ItemIndicator>
                    <SelectPrimitive.ItemText className="col-start-2 row-start-1 min-w-0 truncate">
                      <span className="block min-w-0 truncate">
                        {option.label}
                      </span>
                    </SelectPrimitive.ItemText>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.List>
            </SelectPrimitive.Popup>
          </SelectPrimitive.Positioner>
        </SelectPrimitive.Portal>
      </div>
    </SelectPrimitive.Root>
  )
}

export { Select, type SelectOption, type SelectProps }
