import type { Metadata } from 'next';
import { businessRepository, repositoriesFor } from '@booking/db';
import { requirePermission } from '@/server/auth/guard';
import { AccessWorkspace } from '@/components/access/access-workspace';

export const metadata: Metadata = { title: 'Access' };

export default async function AccessPage() {
  const session = await requirePermission('settings.manage');
  const businessId = session.user.businessId;

  const repos = repositoriesFor(businessId);
  const [business, roles, permissions, team, audit, auditActions] = await Promise.all([
    businessRepository.getById(businessId),
    repos.roles.listRoles(),
    repos.roles.listPermissions(),
    repos.roles.listTeam(),
    repos.audit.list({ limit: 50 }),
    repos.audit.distinctActions(),
  ]);

  return (
    <AccessWorkspace
      roles={roles}
      permissions={permissions}
      team={team}
      audit={audit}
      auditActions={auditActions}
      timeZone={business?.timezone || 'UTC'}
    />
  );
}
