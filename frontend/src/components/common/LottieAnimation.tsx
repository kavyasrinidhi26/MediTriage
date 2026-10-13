import React from 'react';
import { Lottie } from 'lottie-react';
import { useReducedMotion } from 'motion/react';

export interface LottieAnimationProps {
  animationData: Record<string, any>;
  loop?: boolean;
  autoplay?: boolean;
  width?: number | string;
  height?: number | string;
  className?: string;
  fallbackIcon?: React.ReactNode;
  'aria-label'?: string;
}

/**
 * LottieAnimation — Accessible Lottie Player Component
 * Automatically switches to static fallback when prefers-reduced-motion is enabled,
 * and maintains zero delay on application actions or state changes.
 */
export const LottieAnimation: React.FC<LottieAnimationProps> = ({
  animationData,
  loop = true,
  autoplay = true,
  width = 64,
  height = 64,
  className = '',
  fallbackIcon,
  'aria-label': ariaLabel = 'Animation',
}) => {
  const shouldReduceMotion = useReducedMotion();

  // Respect reduced-motion: render static fallback icon
  if (shouldReduceMotion) {
    return (
      <div
        className={`lottie-static-fallback ${className}`}
        style={{ width, height, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        role="img"
        aria-label={ariaLabel}
      >
        {fallbackIcon || <div className="static-indicator-dot" />}
      </div>
    );
  }

  return (
    <div
      className={`lottie-container ${className}`}
      style={{ width, height, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      role="img"
      aria-label={ariaLabel}
    >
      <Lottie
        src={animationData}
        loop={loop}
        autoplay={autoplay}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};

export default LottieAnimation;
