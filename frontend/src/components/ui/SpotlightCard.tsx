import React, { useState, useRef, useCallback } from 'react';
import { motion, useReducedMotion } from 'motion/react';

export interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
  borderGlow?: boolean;
}

/**
 * SpotlightCard — Cult UI inspired interactive card with Motion animations.
 * Tracks relative mouse position for radial spotlighting and provides subtle,
 * accessible hover/press feedback respecting prefers-reduced-motion.
 */
export const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  className = '',
  spotlightColor = 'rgba(13, 148, 136, 0.12)', // Default medical teal spotlight
  borderGlow = true,
  onMouseMove,
  onMouseEnter,
  onMouseLeave,
  style,
  ...props
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const shouldReduceMotion = useReducedMotion();

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      setPosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      onMouseMove?.(e);
    },
    [onMouseMove]
  );

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      setIsHovered(true);
      onMouseEnter?.(e);
    },
    [onMouseEnter]
  );

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      setIsHovered(false);
      onMouseLeave?.(e);
    },
    [onMouseLeave]
  );

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      whileHover={shouldReduceMotion ? undefined : { y: -2, transition: { duration: 0.15 } }}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.99, transition: { duration: 0.1 } }}
      className={`cult-spotlight-card ${borderGlow ? 'with-border-glow' : ''} ${className}`}
      style={
        {
          ...style,
          '--spotlight-x': `${position.x}px`,
          '--spotlight-y': `${position.y}px`,
          '--spotlight-color': spotlightColor,
        } as React.CSSProperties
      }
      {...(props as any)}
    >
      {/* Dynamic Cursor Spotlight Overlay */}
      {isHovered && (
        <div
          className="cult-spotlight-overlay"
          aria-hidden="true"
        />
      )}
      <div className="cult-spotlight-content">{children}</div>
    </motion.div>
  );
};

export default SpotlightCard;
