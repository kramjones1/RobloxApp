import React from 'react';

type OnlineDotProps = {
  online: boolean;
  size?: number;
  borderColor?: string;
  style?: React.CSSProperties;
};

/** Shared visual indicator for the app-wide authenticated-user presence state. */
export default function OnlineDot({
  online,
  size = 10,
  borderColor = '#161616',
  style,
}: OnlineDotProps) {
  if (!online) return null;

  return (
    <span
      aria-label="Online"
      title="Online"
      style={{
        position: 'absolute',
        right: 0,
        bottom: 0,
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#31d17c',
        border: `2px solid ${borderColor}`,
        pointerEvents: 'none',
        ...style,
      }}
    />
  );
}
