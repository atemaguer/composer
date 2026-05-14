import {
  useCallback,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-7 rounded-lg",
        "icon-xs":
          "size-7 rounded-lg in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm":
          "size-7 rounded-lg in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-7 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    tooltip?: ReactNode
    tooltipSide?: ComponentProps<typeof TooltipContent>["side"] | "auto"
  }

type TooltipSide = NonNullable<ComponentProps<typeof TooltipContent>["side"]>

function getAutoTooltipSide(element: HTMLElement): TooltipSide {
  const rect = element.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2

  if (centerX < viewportWidth * 0.25) {
    return "right"
  }

  if (centerX > viewportWidth * 0.75) {
    return "left"
  }

  if (centerY > viewportHeight * 0.72) {
    return "top"
  }

  if (centerY < viewportHeight * 0.22) {
    return "bottom"
  }

  return "top"
}

function Button({
  className,
  variant = "default",
  size = "default",
  tooltip,
  tooltipSide = "auto",
  onFocus,
  onPointerEnter,
  ...props
}: ButtonProps) {
  const [autoSide, setAutoSide] = useState<TooltipSide>("top")
  const side = tooltipSide === "auto" ? autoSide : tooltipSide
  const updateAutoSide = useCallback(
    (element: HTMLElement) => {
      if (tooltipSide === "auto") {
        setAutoSide(getAutoTooltipSide(element))
      }
    },
    [tooltipSide]
  )
  const handleFocus: ButtonPrimitive.Props["onFocus"] = useCallback(
    (event) => {
      updateAutoSide(event.currentTarget)
      onFocus?.(event)
    },
    [onFocus, updateAutoSide]
  )
  const handlePointerEnter: ButtonPrimitive.Props["onPointerEnter"] =
    useCallback(
      (event) => {
        updateAutoSide(event.currentTarget)
        onPointerEnter?.(event)
      },
      [onPointerEnter, updateAutoSide]
    )
  const button = (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      onFocus={handleFocus}
      onPointerEnter={handlePointerEnter}
      {...props}
    />
  )

  if (!tooltip) {
    return button
  }

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side={side}>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

export { Button, buttonVariants }
