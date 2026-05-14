import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

type SwitchProps = Omit<SwitchPrimitive.Root.Props, "children"> & {
  className?: string
  thumbClassName?: string
}

function Switch({ className, thumbClassName, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border border-transparent bg-app-text/[0.12] outline-none transition-colors",
        "focus-visible:border-app-blue/60 focus-visible:ring-2 focus-visible:ring-app-blue/25",
        "data-checked:bg-app-blue data-disabled:cursor-default data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block h-[18px] w-[18px] translate-x-[2px] rounded-full bg-app-text shadow-[0_2px_8px_color-mix(in_srgb,var(--color-app-bg)_40%,transparent)] transition-transform",
          "data-checked:translate-x-[18px] data-disabled:bg-app-muted",
          thumbClassName
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch, type SwitchProps }
