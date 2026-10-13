import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

export interface ShimmerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  shimmerColor?: string;
}

/**
 * ShimmerButton — Cult UI inspired interactive action button with Motion feedback.
 * Combines accessible native HTML button semantics with an elegant, glowing shimmer
 * border micro-interaction tailored for hospital clinical workflows.
 */
export const ShimmerButton: React.FC<ShimmerButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  disabled = false,
  ...props
}) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      disabled={disabled}
      whileHover={disabled || shouldReduceMotion ? undefined : { y: -1, scale: 1.01, transition: { duration: 0.15 } }}
      whileTap={disabled || shouldReduceMotion ? undefined : { scale: 0.98, transition: { duration: 0.1 } }}
      className={`cult-shimmer-btn cult-shimmer-${variant} cult-shimmer-size-${size} ${className}`}
      {...(props as any)}
    >
      <span className="cult-shimmer-border-beam" aria-hidden="true" />
      <span className="cult-shimmer-inner">
        {icon && <span className="cult-shimmer-icon">{icon}</span>}
        <span className="cult-shimmer-text">{children}</span>
      </span>
    </motion.button>
  );
};

export default ShimmerButton;
