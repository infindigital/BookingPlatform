'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Plus, Pencil, Trash2, Shield, ShieldCheck, Lock } from 'lucide-react';
import { groupedPermissions, permissionLabel } from '@booking/core';
import type { RoleRow } from '@booking/db';
import { Sheet, SheetContent, SheetClose, SheetTitle } from '@booking/ui/sheet';
import { Button } from '@booking/ui/button';
import { Badge } from '@booking/ui/badge';
import {
  createRoleAction,
  updateRoleAction,
  deleteRoleAction,
  type RoleFormInput,
} from '@/server/access/actions';

const CONTROL =
  'h-9 w-full rounded-none border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

type Editor = { mode: 'create' } | { mode: 'edit'; role: RoleRow };

export function RolesPanel({ initial, availableKeys }: { initial: RoleRow[]; availableKeys: string[] }) {
  const router = useRouter();
  const [rows] = useState<RoleRow[]>(initial);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function remove(role: RoleRow) {
    if (role.userCount > 0) {
      if (!confirm(`"${role.name}" is assigned to ${role.userCount} member${role.userCount === 1 ? '' : 's'}. Deleting it removes their access from this role. Continue?`)) return;
    } else if (!confirm(`Delete the "${role.name}" role?`)) {
      return;
    }
    setError(null);
    start(async () => {
      const res = await deleteRoleAction(role.id);
      if (!res.ok) setError(res.error ?? 'Could not delete the role.');
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Roles bundle permissions. Assign them to team members on the Team tab. System roles are locked.
        </p>
        <Button size="sm" onClick={() => { setError(null); setEditor({ mode: 'create' }); }}>
          <Plus /> New role
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <ul className="space-y-2">
        {rows.map((role) => (
          <li key={role.id} className="flex flex-wrap items-start justify-between gap-3 rounded-none border border-border bg-card p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-2 font-medium">
                  {role.isSystem ? <ShieldCheck className="size-4 text-primary" /> : <Shield className="size-4 text-muted-foreground" />}
                  {role.name}
                </span>
                {role.isSystem ? <Badge tone="info">System</Badge> : null}
                <Badge tone="neutral">{role.userCount} member{role.userCount === 1 ? '' : 's'}</Badge>
              </div>
              {role.description ? <p className="mt-1 text-sm text-muted-foreground">{role.description}</p> : null}
              <p className="mt-1.5 text-xs text-muted-foreground">
                {role.permissionKeys.length === 0
                  ? 'No permissions'
                  : role.permissionKeys.map((k) => permissionLabel(k)).join(', ')}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {role.isSystem ? (
                <span className="inline-flex items-center gap-1 px-2 text-xs text-muted-foreground">
                  <Lock className="size-3.5" /> Locked
                </span>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => { setError(null); setEditor({ mode: 'edit', role }); }}>
                    <Pencil /> Edit
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Delete role" disabled={pending} onClick={() => remove(role)}>
                    <Trash2 />
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      <RoleEditor
        key={editor ? (editor.mode === 'edit' ? editor.role.id : 'new') : 'closed'}
        editor={editor}
        availableKeys={availableKeys}
        onOpenChange={(o) => { if (!o) setEditor(null); }}
        onSaved={() => { setEditor(null); router.refresh(); }}
      />
    </div>
  );
}

function RoleEditor({
  editor,
  availableKeys,
  onOpenChange,
  onSaved,
}: {
  editor: Editor | null;
  availableKeys: string[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const existing = editor?.mode === 'edit' ? editor.role : null;
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [selected, setSelected] = useState<string[]>(existing?.permissionKeys ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const groups = useMemo(() => {
    const allowed = new Set(availableKeys);
    return groupedPermissions()
      .map((g) => ({ group: g.group, permissions: g.permissions.filter((p) => allowed.has(p.key)) }))
      .filter((g) => g.permissions.length > 0);
  }, [availableKeys]);

  function toggle(key: string) {
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  }

  function submit() {
    setError(null);
    if (!name.trim()) {
      setError('Enter a role name.');
      return;
    }
    const input: RoleFormInput = {
      name: name.trim(),
      description: description.trim() || null,
      permissionKeys: selected,
    };
    start(async () => {
      const res = existing ? await updateRoleAction(existing.id, input) : await createRoleAction(input);
      if (res.ok) onSaved();
      else setError(res.error ?? 'Could not save the role.');
    });
  }

  return (
    <Sheet open={!!editor} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[32rem] max-w-[96vw] flex-col p-0">
        <header className="flex items-center justify-between border-b border-border p-5">
          <SheetTitle className="text-base font-semibold">{existing ? 'Edit role' : 'New role'}</SheetTitle>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Close">
              <X />
            </Button>
          </SheetClose>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={CONTROL} placeholder="Front desk" autoFocus />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Description (optional)</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={CONTROL} placeholder="What this role can do" />
          </label>

          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Permissions</p>
            {groups.map((g) => (
              <fieldset key={g.group} className="space-y-2 border border-border p-3">
                <legend className="px-1 text-xs font-medium text-muted-foreground">{g.group}</legend>
                <div className="space-y-2">
                  {g.permissions.map((p) => (
                    <label key={p.key} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selected.includes(p.key)}
                        onChange={() => toggle(p.key)}
                        className="mt-0.5 size-4 rounded border-border accent-primary"
                      />
                      <span>
                        <span className="font-medium">{p.label}</span>
                        <span className="block text-xs text-muted-foreground">{p.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

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
            {pending ? 'Saving…' : existing ? 'Save role' : 'Create role'}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
