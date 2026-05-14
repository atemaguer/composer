import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

type SliderProps = Omit<
  SliderPrimitive.Root.Props<number>,
  "children" | "value" | "onValueChange"
> & {
  value: number
  onValueChange: (value: number) => void
  ariaLabel?: string
  className?: string
  controlClassName?: string
  trackClassName?: string
  indicatorClassName?: string
  thumbClassName?: string
}

function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  ariaLabel,
  className,
  controlClassName,
  trackClassName,
  indicatorClassName,
  thumbClassName,
  ...props
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      value={value}
      onValueChange={onValueChange}
      min={min}
      max={max}
      step={step}
      className={cn(
        "grid w-[180px] min-w-[140px] touch-none select-none gap-2 data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Control
        data-slot="slider-control"
        className={cn(
          "relative flex h-5 items-center outline-none",
          controlClassName
        )}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(
            "relative h-1.5 w-full overflow-hidden rounded-full bg-app-text/[0.12] data-disabled:bg-app-text/[0.08]",
            trackClassName
          )}
        >
          <SliderPrimitive.Indicator
            data-slot="slider-indicator"
            className={cn(
              "absolute h-full rounded-full bg-app-blue data-disabled:bg-app-dim",
              indicatorClassName
            )}
          />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          getAriaLabel={ariaLabel ? () => ariaLabel : undefined}
          className={cn(
            "size-[18px] rounded-full border border-app-line-bright bg-app-text shadow-[0_2px_10px_color-mix(in_srgb,var(--color-app-bg)_45%,transparent)] outline-none transition-colors",
            "focus-visible:border-app-blue/70 focus-visible:ring-2 focus-visible:ring-app-blue/25",
            "data-disabled:bg-app-muted",
            thumbClassName
          )}
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider, type SliderProps }
