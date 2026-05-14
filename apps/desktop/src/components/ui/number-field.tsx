import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from "react"

import { cn } from "@/lib/utils"

type NumberFieldProps = {
  value: number
  onValueChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  ariaLabel?: string
  disabled?: boolean
  className?: string
  inputClassName?: string
}

function clampValue(value: number, min?: number, max?: number) {
  if (typeof min === "number" && value < min) {
    return min
  }

  if (typeof max === "number" && value > max) {
    return max
  }

  return value
}

function NumberField({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  suffix,
  ariaLabel,
  disabled,
  className,
  inputClassName
}: NumberFieldProps) {
  const [inputValue, setInputValue] = useState(() => String(value))

  useEffect(() => {
    setInputValue(String(value))
  }, [value])

  function commitValue(nextInputValue = inputValue) {
    const nextValue = Number(nextInputValue)

    if (!Number.isFinite(nextValue)) {
      setInputValue(String(value))
      return
    }

    const clampedValue = clampValue(nextValue, min, max)
    setInputValue(String(clampedValue))

    if (clampedValue !== value) {
      onValueChange(clampedValue)
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setInputValue(event.currentTarget.value)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      commitValue()
      event.currentTarget.blur()
      return
    }

    if (event.key === "Escape") {
      setInputValue(String(value))
      event.currentTarget.blur()
    }
  }

  return (
    <span
      data-slot="number-field"
      className={cn(
        "inline-flex h-8 min-w-[88px] items-center rounded-lg border border-app-line bg-app-panel/70 px-2.5 text-[14px] text-app-muted transition-colors",
        "focus-within:border-app-blue/60 focus-within:ring-2 focus-within:ring-app-blue/25",
        "has-[input:disabled]:opacity-50",
        className
      )}
    >
      <input
        data-slot="number-field-input"
        type="number"
        value={inputValue}
        onChange={handleChange}
        onBlur={() => commitValue()}
        onKeyDown={handleKeyDown}
        min={min}
        max={max}
        step={step}
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-right text-app-text outline-none [appearance:textfield] disabled:cursor-default",
          "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          inputClassName
        )}
      />
      {suffix && (
        <span className="ml-1 shrink-0 text-[13px] text-app-dim">{suffix}</span>
      )}
    </span>
  )
}

export { NumberField, type NumberFieldProps }
