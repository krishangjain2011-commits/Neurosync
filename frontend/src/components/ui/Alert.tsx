import React from "react";

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  type?: "info" | "success" | "warning" | "error";
  icon?: React.ReactNode;
  title?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
  children: React.ReactNode;
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  (
    {
      type = "info",
      icon,
      title,
      dismissible = false,
      onDismiss,
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = React.useState(true);

    const handleDismiss = () => {
      setIsOpen(false);
      onDismiss?.();
    };

    if (!isOpen) return null;

    const typeClasses = `alert alert-${type}`;
    const allClasses = [typeClasses, className].filter(Boolean).join(" ");

    return (
      <div ref={ref} className={allClasses} role="alert" {...props}>
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <div className="flex-1">
          {title && <h4 style={{ marginBottom: "0.5rem", fontWeight: "600" }}>{title}</h4>}
          <div>{children}</div>
        </div>
        {dismissible && (
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 ml-auto text-lg leading-none opacity-50 hover:opacity-100"
            aria-label="Dismiss alert"
          >
            ×
          </button>
        )}
      </div>
    );
  }
);

Alert.displayName = "Alert";
