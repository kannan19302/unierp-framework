'use client';

import type { ReactNode } from 'react';
import { EmptyState, usePermission } from '@unerp/ui';

// ─────────────────────────────────────────────────
// Permission guards — thin layer over @unerp/ui's
// PermissionContext so framework views and routes
// share one RBAC vocabulary (`module.resource.action`).
// ─────────────────────────────────────────────────

export { usePermission, PermissionContext, ProtectedComponent, ProtectedField } from '@unerp/ui';

export interface GuardedProps {
  /** RBAC code; when omitted, access is granted */
  permission?: string;
  children: ReactNode;
  /** Rendered when access is denied; defaults to nothing */
  fallback?: ReactNode;
}

/** Hides children when the user lacks the permission. */
export function Guarded({ permission, children, fallback = null }: GuardedProps) {
  const allowed = usePermission(permission ?? '');
  if (permission && !allowed) return <>{fallback}</>;
  return <>{children}</>;
}

/** Full-page route guard — renders a 403 empty state instead of the page. */
export function RouteGuard({ permission, children }: { permission?: string; children: ReactNode }) {
  const allowed = usePermission(permission ?? '');
  if (permission && !allowed) {
    return (
      <EmptyState
        title="Access denied"
        description="You don't have permission to view this page. Contact your administrator if you believe this is a mistake."
      />
    );
  }
  return <>{children}</>;
}
