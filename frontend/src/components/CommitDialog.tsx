import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (message: string) => void;
};

export default function CommitDialog({ open, onClose, onSubmit }: Props) {
  const [message, setMessage] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setMessage("");
    const t = setTimeout(() => textRef.current?.focus(), 0);
    return () => clearTimeout(t);
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
    const msg = message.trim();
    if (!msg) return;
    onSubmit(msg);
  }

  return createPortal(
    <div
      className="win95-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
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
            value={message}
            onChange={(e) => setMessage(e.target.value)}
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
    </div>,
    document.body,
  );
}
