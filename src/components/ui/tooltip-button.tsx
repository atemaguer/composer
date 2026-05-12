import {
  forwardRef,
  useCallback,
  useState,
  type ButtonHTMLAttributes,
  type FocusEvent,
  type PointerEvent,
  type ReactNode
} from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";

type TooltipButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tooltip?: ReactNode;
  tooltipSide?: TooltipSide | "auto";
};

type TooltipSide = "top" | "right" | "bottom" | "left";

function getAutoTooltipSide(element: HTMLElement): TooltipSide {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  if (centerX < viewportWidth * 0.25) {
    return "right";
  }

  if (centerX > viewportWidth * 0.75) {
    return "left";
  }

  if (centerY > viewportHeight * 0.72) {
    return "top";
  }

  if (centerY < viewportHeight * 0.22) {
    return "bottom";
  }

  return "top";
}

const TooltipButton = forwardRef<HTMLButtonElement, TooltipButtonProps>(
  (
    {
      tooltip,
      tooltipSide = "auto",
      children,
      onFocus,
      onPointerEnter,
      ...props
    },
    ref
  ) => {
    const [autoSide, setAutoSide] = useState<TooltipSide>("top");
    const side = tooltipSide === "auto" ? autoSide : tooltipSide;
    const updateAutoSide = useCallback(
      (element: HTMLButtonElement) => {
        if (tooltipSide === "auto") {
          setAutoSide(getAutoTooltipSide(element));
        }
      },
      [tooltipSide]
    );
    const handleFocus = useCallback(
      (event: FocusEvent<HTMLButtonElement>) => {
        updateAutoSide(event.currentTarget);
        onFocus?.(event);
      },
      [onFocus, updateAutoSide]
    );
    const handlePointerEnter = useCallback(
      (event: PointerEvent<HTMLButtonElement>) => {
        updateAutoSide(event.currentTarget);
        onPointerEnter?.(event);
      },
      [onPointerEnter, updateAutoSide]
    );
    const button = (
      <button
        ref={ref}
        onFocus={handleFocus}
        onPointerEnter={handlePointerEnter}
        {...props}
      >
        {children}
      </button>
    );

    if (!tooltip) {
      return button;
    }

    return (
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent side={side}>{tooltip}</TooltipContent>
      </Tooltip>
    );
  }
);

TooltipButton.displayName = "TooltipButton";

export { TooltipButton };
