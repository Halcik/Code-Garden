import { useEffect, useRef } from "react";

export default function SubmitConfirmation({ confirm, cancel }: { confirm: () => void; cancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return <dialog ref={dialog} className="student-submit-dialog" aria-labelledby="submit-confirm-title" onCancel={cancel}>
    <h2 id="submit-confirm-title">Potwierdzenie wysłania</h2>
    <p>Czy na pewno chcesz wysłać tę wersję rozwiązania? Kod zostanie ponownie sprawdzony na testach.</p>
    <div className="student-task-actions">
      <button className="admin-button" onClick={cancel} autoFocus>Anuluj</button>
      <button className="admin-button primary" onClick={confirm}>Potwierdź wysłanie</button>
    </div>
  </dialog>;
}
