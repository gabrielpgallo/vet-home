"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CircleAlert, X } from "lucide-react";

type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
};
export type NavigationGuard = () => boolean | Promise<boolean>;

// Keep the dialog beside its caller so it inherits the clinic's theme, including
// when the caller lives inside a drawer. A second click never starts two actions.
export function useConfirmation() {
  const [options, setOptions] = useState<ConfirmationOptions | null>(null);
  const pending = useRef<((accepted: boolean) => void) | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current?.(false);
      pending.current = null;
    };
  }, []);
  const confirm = useCallback((next: ConfirmationOptions): Promise<boolean> => {
    if (!mounted.current || pending.current) return Promise.resolve(false);
    return new Promise((resolve) => {
      pending.current = resolve;
      setOptions(next);
    });
  }, []);
  const settle = useCallback((accepted: boolean) => {
    const resolve = pending.current;
    if (!resolve) return;
    pending.current = null;
    setOptions(null);
    resolve(accepted);
  }, []);
  return {
    confirm,
    confirmation: options ? (
      <ConfirmationModal options={options} onResolve={settle} />
    ) : null,
  };
}

function ConfirmationModal({
  options,
  onResolve,
}: {
  options: ConfirmationOptions;
  onResolve: (accepted: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    const previouslyFocused = document.activeElement;
    const previous = document.body.style.overflow;
    const ownsScrollLock = previous !== "hidden";
    if (ownsScrollLock) document.body.style.overflow = "hidden";
    element?.showModal();
    cancel.current?.focus();
    return () => {
      element?.close();
      if (ownsScrollLock) document.body.style.overflow = previous;
      if (
        previouslyFocused instanceof HTMLElement &&
        previouslyFocused.isConnected
      )
        previouslyFocused.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      role="alertdialog"
      className="confirmation-modal"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onResolve(false);
      }}
    >
      <div className="confirmation-heading">
        <span className="confirmation-icon" aria-hidden="true">
          <CircleAlert size={22} />
        </span>
        <button
          className="confirmation-close"
          type="button"
          aria-label="Fechar confirmação"
          onClick={() => onResolve(false)}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <h2 id={`${id}-title`}>{options.title}</h2>
      <p id={`${id}-description`}>{options.description}</p>
      <div className="confirmation-actions">
        <button ref={cancel} type="button" onClick={() => onResolve(false)}>
          {options.cancelLabel || "Cancelar"}
        </button>
        <button
          type="button"
          className={options.danger ? "confirmation-danger" : "primary"}
          onClick={() => onResolve(true)}
        >
          {options.confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
