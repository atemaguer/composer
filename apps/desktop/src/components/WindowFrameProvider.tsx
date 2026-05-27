import { useEffect, type ReactNode } from "react";

const visibleTrafficLightInset = "84px";
const hiddenTrafficLightInset = "12px";

type WindowFrameProviderProps = {
  children: ReactNode;
};

export function WindowFrameProvider({ children }: WindowFrameProviderProps) {
  useEffect(() => {
    const applyFrameState = (state?: WindowFrameState) => {
      const shouldReserveTrafficLightSpace =
        window.composer?.platform === "darwin" &&
        state?.titlebarControlsVisible !== false;

      document.documentElement.style.setProperty(
        "--app-titlebar-control-left-inset",
        shouldReserveTrafficLightSpace
          ? visibleTrafficLightInset
          : hiddenTrafficLightInset
      );
    };

    applyFrameState();

    const removeListener = window.composer?.onWindowFrameState?.(applyFrameState);

    void window.composer?.getWindowFrameState?.()
      .then(applyFrameState)
      .catch(() => undefined);

    return () => {
      removeListener?.();
      document.documentElement.style.removeProperty(
        "--app-titlebar-control-left-inset"
      );
    };
  }, []);

  return <>{children}</>;
}
