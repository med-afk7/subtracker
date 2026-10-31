import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

// Wrapper around the native <dialog>, which handles focus, Esc and the backdrop for us
export default function Modal({ isOpen, title, onClose, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Sync the dialog with the isOpen prop
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  // Clicks on the backdrop land on the <dialog> element itself, not its content
  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) onClose();
  };

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose} onClick={handleClick}>
      <div className="modal-body">
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Only mount the content while open so forms start fresh each time */}
        {isOpen && children}
      </div>
    </dialog>
  );
}
