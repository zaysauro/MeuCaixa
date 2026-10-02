import { ReactNode } from "react";
import { roleHasPermission } from "@/lib/rbac";

type CanProps = {
  role?: string | null;
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
};

export function Can({ role, permission, children, fallback = null }: CanProps) {
  return roleHasPermission(role, permission) ? children : fallback;
}
