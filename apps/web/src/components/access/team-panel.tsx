'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, UserCog, ShieldCheck, Shield } from 'lucide-react';
import type { RoleRow, TeamMemberRow } from '@booking/db';
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import { Badge } from '@booking/ui/badge';
import { setUserRolesAction } from '@/server/access/actions';

export function TeamPanel({ members, roles }: { members: TeamMemberRow[]; roles: RoleRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<TeamMemberRow | null>(null);
  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? 'Unknown role';

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Assign one or more roles to each team member. A member with no roles has no admin access.
      </p>

      <ul className="space-y-2">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-none border border-border bg-card p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{m.name}</span>
                {m.isActive ? null : <Badge tone="neutral">Inactive</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{m.email}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {m.roleIds.length === 0 ? (
                  <Badge tone="warning">No roles</Badge>
                ) : (
                  m.roleIds.map((id) => <Badge key={id} tone="neutral">{roleName(id)}</Badge>)
                )}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setEditing(m)}>
              <UserCog /> Manage roles
            </Button>
          </li>
        ))}
      </ul>

      <RoleAssigner
        key={editing?.id ?? 'closed'}
        member={editing}
        roles={roles}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        onSaved={() => { setEditing(null); router.refresh(); }}
      />
    </div>
  );
}

function RoleAssigner({
  member,
  roles,
  onOpenChange,
  onSaved,
}: {
  member: TeamMemberRow | null;
  roles: RoleRow[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(member?.roleIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((v) => v !== id) : [...s, id]));
  }

  function submit() {
    if (!member) return;
    setError(null);
    start(async () => {
      const res = await setUserRolesAction(member.id, selected);
      if (res.ok) onSaved();
      else setError(res.error ?? 'Could not update role assignments.');
    });
  }

  return (
    <Sheet open={!!member} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[30rem] max-w-[96vw] flex-col p-0">
        <header className="flex items-center justify-between border-b border-border p-5">
          <div className="min-w-0">
            <SheetTitle className="text-base font-semibold">Manage roles</SheetTitle>
            {member ? <p className="truncate text-sm text-muted-foreground">{member.name} · {member.email}</p> : null}
          </div>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Close">
              <X />
            </Button>
          </SheetClose>
        </header>

        <div className="flex-1 space-y-2 overflow-y-auto p-5">
          {roles.map((r) => (
            <label key={r.id} className="flex items-start gap-2 rounded-none border border-border p-3 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(r.id)}
                onChange={() => toggle(r.id)}
                className="mt-0.5 size-4 rounded border-border accent-primary"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium">
                  {r.isSystem ? <ShieldCheck className="size-3.5 text-primary" /> : <Shield className="size-3.5 text-muted-foreground" />}
                  {r.name}
                </span>
                {r.description ? <span className="block text-xs text-muted-foreground">{r.description}</span> : null}
              </span>
            </label>
          ))}

          {error ? (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border p-4">
          <SheetClose asChild>
            <Button type="button" variant="ghost">Cancel</Button>
          </SheetClose>
          <Button type="button" onClick={submit} disabled={pending} aria-busy={pending}>
            {pending ? 'Saving…' : 'Save roles'}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
