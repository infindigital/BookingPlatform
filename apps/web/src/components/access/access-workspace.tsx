'use client';

import { useState } from 'react';
import { Shield, Users, History } from 'lucide-react';
import type { RoleRow, PermissionRow, TeamMemberRow, AuditPage } from '@booking/db';
import { Badge } from '@booking/ui/badge';
import { RolesPanel } from './roles-panel';
import { TeamPanel } from './team-panel';
import { AuditLogPanel } from './audit-log-panel';

type Tab = 'roles' | 'team' | 'audit';

export function AccessWorkspace({
  roles,
  permissions,
  team,
  audit,
  auditActions,
  timeZone,
}: {
  roles: RoleRow[];
  permissions: PermissionRow[];
  team: TeamMemberRow[];
  audit: AuditPage;
  auditActions: string[];
  timeZone: string;
}) {
  const [tab, setTab] = useState<Tab>('roles');
  const availableKeys = permissions.map((p) => p.key);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Access</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Roles and permissions for your team, plus an audit trail of sensitive actions.
        </p>
      </header>

      <div className="flex items-center gap-1 border-b border-border">
        <TabButton active={tab === 'roles'} onClick={() => setTab('roles')} icon={<Shield className="size-4" />}>
          Roles
          <Badge tone="neutral" className="ml-1.5">{roles.length}</Badge>
        </TabButton>
        <TabButton active={tab === 'team'} onClick={() => setTab('team')} icon={<Users className="size-4" />}>
          Team
          <Badge tone="neutral" className="ml-1.5">{team.length}</Badge>
        </TabButton>
        <TabButton active={tab === 'audit'} onClick={() => setTab('audit')} icon={<History className="size-4" />}>
          Audit log
        </TabButton>
      </div>

      {tab === 'roles' ? <RolesPanel initial={roles} availableKeys={availableKeys} /> : null}
      {tab === 'team' ? <TeamPanel members={team} roles={roles} /> : null}
      {tab === 'audit' ? (
        <AuditLogPanel initial={audit} actions={auditActions} members={team} timeZone={timeZone} />
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
        active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
