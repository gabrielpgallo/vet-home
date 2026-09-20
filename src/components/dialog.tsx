"use client";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { useConfirmation } from "./confirmation";
import { X } from "lucide-react";

export function Dialog({
  title,
  onClose,
  children,
  drawer = false,
  dirtyRef,
}: {
  title: string;
  drawer?: boolean;
  dirtyRef: RefObject<boolean>;
  onClose: () => void;
  children: ReactNode;
}) {
  const { confirm, confirmation } = useConfirmation();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dirtyRef.current = false;
    dialog?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const before = (event: BeforeUnloadEvent) => {
      if (drawer && dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => {
      dialog?.close();
      document.body.style.overflow = previous;
      window.removeEventListener("beforeunload", before);
    };
  }, [drawer, dirtyRef]);
  async function dismiss() {
    if (ref.current?.querySelector("form > fieldset:disabled")) return;
    if (
      drawer &&
      dirtyRef.current &&
      !(await confirm({
        title: "Descartar este rascunho?",
        description:
          "As alterações deste documento ainda não foram salvas. Ao fechar, elas serão descartadas.",
        confirmLabel: "Descartar alterações",
        cancelLabel: "Continuar editando",
        danger: true,
      }))
    )
      return;
    onClose();
  }
  return (
    <dialog
      ref={ref}
      className={drawer ? "ai-drawer document-drawer" : undefined}
      onChangeCapture={() => {
        if (drawer) dirtyRef.current = true;
      }}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      aria-labelledby="dialog-title"
    >
      {confirmation}
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button type="button" aria-label="Fechar" onClick={dismiss}>
          <X size={20} />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
