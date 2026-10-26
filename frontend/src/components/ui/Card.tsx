import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
  hoverable?: boolean;
  children: React.ReactNode;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ size = "md", hoverable = false, className = "", children, ...props }, ref) => {
    const sizeClasses = {
      sm: "card card-sm",
      md: "card",
      lg: "card card-lg",
    }[size];

    const hoverClasses = hoverable ? "hover:shadow-lg hover:transform hover:-translate-y-1" : "";

    const allClasses = [sizeClasses, hoverClasses, className].filter(Boolean).join(" ");

    return (
      <div ref={ref} className={allClasses} {...props}>
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
