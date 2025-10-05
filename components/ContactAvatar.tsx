// components/ContactAvatar.tsx
import React from 'react';
import { User } from 'lucide-react';
import type { Contact } from '@/types';
import Image from 'next/image';

function getInitials(name?: string) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('');
}

export default function ContactAvatar({ contact, size = 64 }: { contact: Contact; size?: number }) {
  const s = `${size}px`;
  if (contact.avatarUrl) {
    return (
      <Image
        src={contact.avatarUrl}
        alt={contact.name}
        width={size}
        height={size}
        className="rounded-full object-cover shadow"
        style={{ width: s, height: s }}
      />
    );
  }
  const initials = getInitials(contact.name);
  return (
    <div
      className="rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center font-semibold shadow"
      style={{ width: s, height: s }}
      title={contact.name}
    >
      {initials || <User className="w-1/2 h-1/2 opacity-80" />}
    </div>
  );
}
