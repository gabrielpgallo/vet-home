"use client";
import {
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";
import {
  formatInput,
  formatOnBlur,
  maskError,
  maskedEdit,
  type InputMask,
} from "@/lib/input-formats";
type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange"
> & {
  mask: InputMask;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};
export function MaskedInput({
  mask,
  value,
  defaultValue = "",
  onValueChange,
  onBlur,
  ...props
}: Props) {
  const [internal, setInternal] = useState(defaultValue);
  const input = useRef<HTMLInputElement>(null),
    selection = useRef<number | null>(null);
  const displayed = formatInput(mask, value ?? internal);
  useLayoutEffect(() => {
    if (selection.current !== null) {
      input.current?.setSelectionRange(selection.current, selection.current);
      selection.current = null;
    }
  });
  function update(next: string) {
    setInternal(next);
    onValueChange?.(next);
  }
  return (
    <input
      {...props}
      ref={input}
      value={displayed}
      inputMode={
        props.inputMode ??
        (mask === "phone"
          ? "tel"
          : mask === "cpf"
            ? "numeric"
            : mask === "money"
              ? "decimal"
              : "text")
      }
      onChange={(event) => {
        const element = event.currentTarget;
        const next = maskedEdit(
          mask,
          displayed,
          element.value,
          element.selectionStart ?? element.value.length,
          (event.nativeEvent as InputEvent).inputType,
        );
        element.setCustomValidity("");
        selection.current = next.caret;
        update(next.value);
      }}
      onBlur={(event) => {
        const element = event.currentTarget;
        element.setCustomValidity(maskError(mask, element.value));
        update(formatOnBlur(mask, element.value));
        onBlur?.(event);
      }}
    />
  );
}
