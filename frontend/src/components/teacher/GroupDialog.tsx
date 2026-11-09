import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export default function GroupDialog({ labelledBy, describedBy, onCancel, children, className = "" }: {
  labelledBy: string; describedBy?: string; onCancel: () => void; children: ReactNode; className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (dialog.current?.showModal) dialog.current.showModal();
    else dialog.current?.setAttribute("open", "");
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return <dialog ref={dialog} className={`admin-card group-form-panel ${className}`} aria-modal="true"
    aria-labelledby={labelledBy} aria-describedby={describedBy}
    onCancel={event => { event.preventDefault(); onCancel(); }}>{children}</dialog>;
}
