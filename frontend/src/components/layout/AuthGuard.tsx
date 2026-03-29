'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth';

export function getLandingPage(role?: string, businessType?: string): string {
  if ((role === 'chef' || role === 'cook') && businessType === 'restaurant') return '/kitchen-display';
  return '/pos';
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, currentTenant, loading, loadFromStorage } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/auth/login');
      } else if (!currentTenant) {
        router.push('/auth/login?select_tenant=true');
      } else if (pathname === '/dashboard') {
        router.replace(getLandingPage(currentTenant.role, currentTenant.business_type));
      }
    }
  }, [user, currentTenant, loading, router, pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-brand border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !currentTenant) return null;

  return <>{children}</>;
}
