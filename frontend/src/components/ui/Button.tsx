import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "success" | "outline" | "ghost" | "error";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  loading?: boolean;
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      fullWidth = false,
      icon,
      iconPosition = "left",
      loading = false,
      children,
      disabled,
      className = "",
      ...props
    },
    ref
  ) => {
    const baseClasses = "btn";
    const variantClasses = `btn-${variant}`;
    const sizeClasses = `btn-${size}`;
    const fullWidthClasses = fullWidth ? "btn-full" : "";
    const disabledClasses = disabled || loading ? "opacity-50 cursor-not-allowed" : "";

    const allClasses = [
      baseClasses,
      variantClasses,
      sizeClasses,
      fullWidthClasses,
      disabledClasses,
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        ref={ref}
        className={allClasses}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <span className="animate-spin">⟳</span>
            {children}
          </>
        ) : (
          <>
            {icon && iconPosition === "left" && <span>{icon}</span>}
            {children}
            {icon && iconPosition === "right" && <span>{icon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
