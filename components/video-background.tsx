"use client";

import { useState } from "react";
import type { VideoHTMLAttributes } from "react";

type VideoBackgroundProps = VideoHTMLAttributes<HTMLVideoElement> & {
  fallbackClassName?: string;
};

export function VideoBackground({ className, fallbackClassName, onError, ...rest }: VideoBackgroundProps) {
  const [didError, setDidError] = useState(false);

  if (didError) {
    return <div aria-hidden="true" className={fallbackClassName ?? className} />;
  }

  return (
    <video
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      className={className}
      onError={(event) => {
        setDidError(true);
        onError?.(event);
      }}
      {...rest}
    />
  );
}
