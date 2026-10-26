import React from "react";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "primary" | "success" | "warning" | "error" | "info";
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = "primary", icon, className = "", children, ...props }, ref) => {
    const variantClasses = `badge badge-${variant}`;
    const allClasses = [variantClasses, className].filter(Boolean).join(" ");

    return (
      <span ref={ref} className={allClasses} {...props}>
        {icon && <span>{icon}</span>}
        {children}
      </span>
    );
  }
);

Badge.displayName = "Badge";
