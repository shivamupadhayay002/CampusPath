import React, { useState } from 'react';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CP';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const Avatar: React.FC<AvatarProps> = ({ src, name, size = 'md' }) => {
  const [imgError, setImgError] = useState(false);

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={`${name} profile avatar`}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`${SIZE_CLASSES[size]} rounded-full object-cover shrink-0 border border-[#E3E1EE] dark:border-[#23273A] bg-[#F1F0F7] dark:bg-[#1C2030]`}
      />
    );
  }

  return (
    <div
      aria-label={`${name} avatar initials`}
      className={`${SIZE_CLASSES[size]} rounded-full shrink-0 flex items-center justify-center font-bold bg-[#ECEBFF] text-[#5B4BFF] dark:bg-[#232048] dark:text-[#A59BFF] border border-[#E3E1EE] dark:border-[#2E3248] select-none`}
    >
      {getInitials(name)}
    </div>
  );
};
