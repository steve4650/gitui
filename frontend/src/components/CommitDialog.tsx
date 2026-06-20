import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (message: string) => void;
};

export default function CommitDialog({ open, onClose, onSubmit }: Props) {
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    textRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleSubmit() {
    const msg = textRef.current?.value.trim();
    if (!msg) return;
    onSubmit(msg);
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="win95-overlay" onClick={handleOverlayClick}>
      <div className="win95-dialog">
        <div className="win95-titlebar">
          <span className="win95-title">Commit</span>
          <button className="win95-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="win95-body">
          <label className="win95-label" htmlFor="commit-msg">
            Commit message:
          </label>
          <textarea
            ref={textRef}
            id="commit-msg"
            className="win95-textarea"
            rows={4}
            placeholder="Enter commit message..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <div className="win95-buttons">
            <button type="button" onClick={handleSubmit}>
              OK
            </button>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
