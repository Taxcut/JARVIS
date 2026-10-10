import { useId, useRef, type ReactNode } from 'react';

/** Product confirmation only. The existing native/Core step-up still grants authority. */
export function ConfirmAction({
  children,
  disabled,
  onClick,
  action,
  consequence,
  reversal,
}: {
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
  action: string;
  consequence: string;
  reversal: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = () => {
    dialog.current?.close();
    trigger.current?.focus();
  };
  return (
    <>
      <button
        ref={trigger}
        disabled={disabled}
        onClick={() => dialog.current?.showModal()}
      >
        {children}
      </button>
      <dialog
        ref={dialog}
        className="confirmation-dialog"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-details`}
        onClose={() => trigger.current?.focus()}
      >
        <div className="eyebrow">PROTECTED SECURITY CHANGE</div>
        <h2 id={`${id}-title`}>{action}</h2>
        <div id={`${id}-details`}>
          <p>{consequence}</p>
          <p className="hint">{reversal}</p>
          <p className="hint">
            Your passkey must verify this exact action. Continuing opens the
            protected verification flow; this dialog does not grant permission
            by itself.
          </p>
        </div>
        <div className="actions">
          <button autoFocus className="secondary" onClick={close}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={disabled}
            onClick={() => {
              close();
              onClick();
            }}
          >
            Continue to verification
          </button>
        </div>
      </dialog>
    </>
  );
}
