import { LoaderCircle } from "lucide-react";

import { cn } from "../lib/cn";

type ThreadActivityIndicatorProps = {
  className?: string;
};

export function ThreadActivityIndicator({
  className
}: ThreadActivityIndicatorProps) {
  return (
    <LoaderCircle
      aria-label="Thread running"
      className={cn("shrink-0 animate-spin text-app-accent", className)}
      size={12}
    />
  );
}
