import React, { useState } from 'react';

interface UserAvatarProps {
  name: string;
  avatarUrl?: string;
  gender?: 'L' | 'P' | string;
  role?: 'SISWA' | 'GURU' | 'ADMIN' | 'PETUGAS';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'passport' | 'square' | 'rounded';
  className?: string;
}

export const getInitials = (fullName: string): string => {
  if (!fullName) return '--';
  // Strip common academic titles like Dra., Drs., M.Pd, S.Pd, Dr., H., Hj.
  const cleanName = fullName
    .replace(/\b(Dra|Drs|M\.Pd|S\.Pd|S\.Kom|S\.T|M\.T|Dr|H|Hj)\.?\b/gi, '')
    .trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fullName.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  avatarUrl,
  gender,
  role = 'SISWA',
  size = 'md',
  shape = 'passport',
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);
  const initials = getInitials(name);

  // We consider unsplash links as untrusted/slop according to anti-slop guidelines
  const isUnsplash = typeof avatarUrl === 'string' && avatarUrl.includes('images.unsplash.com');
  const hasValidPhoto = Boolean(avatarUrl && !isUnsplash && !imgError);

  const sizeClasses = {
    xs: 'w-6 text-[10px]',
    sm: 'w-8 text-xs',
    md: 'w-10 text-sm',
    lg: 'w-14 text-base',
    xl: 'w-20 text-xl',
  }[size];

  const aspectClass = shape === 'passport' ? 'aspect-[3/4]' : 'aspect-square';
  const radiusClass = shape === 'rounded' ? 'rounded-md' : 'rounded-sm';

  const isTeacher = role === 'GURU' || role === 'ADMIN';

  if (hasValidPhoto) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setImgError(true)}
        className={`${sizeClasses} ${aspectClass} ${radiusClass} object-cover object-top border ${
          isTeacher ? 'border-amber-500/40 bg-[#121c33]' : 'border-blue-500/40 bg-[#0a1426]'
        } shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses} ${aspectClass} ${radiusClass} flex flex-col items-center justify-center border font-mono font-bold select-none shrink-0 ${
        isTeacher
          ? 'bg-[#14203b] border-amber-500/40 text-amber-300'
          : 'bg-[#09152b] border-blue-500/40 text-blue-300'
      } ${className}`}
      title={`${name} (${role})`}
    >
      <span className="tracking-wider">{initials}</span>
    </div>
  );
};
