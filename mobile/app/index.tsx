import { Redirect } from 'expo-router';
import React from 'react';
import { useAuth } from '@/auth/AuthContext';
import { LoadingView } from '@/components/ui';

export default function Index() {
  const { ready, authenticated } = useAuth();
  if (!ready) return <LoadingView label="Loading…" />;
  return <Redirect href={authenticated ? '/(tabs)/tasks' : '/login'} />;
}
