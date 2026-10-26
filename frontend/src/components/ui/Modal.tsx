import React from "react";
import { Card } from "./Card";
import { Button } from "./Button";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: "sm" | "md" | "lg";
  children?: React.ReactNode;
  footer?: React.ReactNode;
  closeButton?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  size = "md",
  children,
  footer,
  closeButton = true,
}) => {
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", handleEscape);
        document.body.style.overflow = "auto";
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidth = {
    sm: "400px",
    md: "600px",
    lg: "800px",
  }[size];

  const backdropStyle: React.CSSProperties = {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: "var(--z-modal-backdrop)",
  };

  const modalStyle: React.CSSProperties = {
    maxWidth,
    width: "90vw",
    maxHeight: "90vh",
    overflow: "auto",
    zIndex: "var(--z-modal)",
  };

  return (
    <div style={backdropStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <Card style={modalStyle}>
        <div className="flex items-start justify-between mb-lg">
          <div>
            {title && <h2 style={{ marginBottom: "0.5rem" }}>{title}</h2>}
            {description && <p style={{ color: "#6B7280" }}>{description}</p>}
          </div>
          {closeButton && (
            <button
              onClick={onClose}
              className="text-2xl opacity-50 hover:opacity-100 leading-none"
              aria-label="Close modal"
            >
              ×
            </button>
          )}
        </div>

        {children && <div className="mb-lg">{children}</div>}

        {footer && <div className="flex gap-md justify-end mt-lg pt-lg border-t" style={{ borderTopColor: "rgba(0, 0, 0, 0.1)" }}>{footer}</div>}
      </Card>
    </div>
  );
};
