'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth-config';

export default function Home() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (isAuthenticated()) {
      router.push('/dashboard');
    } else {
      router.push('/auth/signin');
    }
  }, [mounted, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">CAP Tracker</h1>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}
