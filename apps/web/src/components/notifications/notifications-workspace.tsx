'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Clock, CheckCircle2, Pencil, Zap } from 'lucide-react';
import type { NotificationTemplateConfig, NotificationActivity, EmailConfigStatus } from '@booking/db';
import { Badge } from '@booking/ui/badge';
import { TemplateEditorDrawer } from './template-editor-drawer';
import { ActivityTable } from './activity-table';
import { EmailDeliveryCard } from './email-delivery-card';

type Tab = 'templates' | 'activity';

export function NotificationsWorkspace({
  templates,
  activity,
  timeZone,
  emailStatus,
  adminEmail,
}: {
  templates: NotificationTemplateConfig[];
  activity: NotificationActivity;
  timeZone: string;
  emailStatus: EmailConfigStatus;
  adminEmail: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('templates');
  const [editing, setEditing] = useState<NotificationTemplateConfig | null>(null);
  const [editorKey, setEditorKey] = useState(0);

  function openEditor(t: NotificationTemplateConfig) {
    setEditing(t);
    setEditorKey((k) => k + 1);
  }
  function onSaved() {
    setEditing(null);
    router.refresh();
  }

  const queued = activity.counts.QUEUED;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customer messages for every booking event, delivered through a durable queue.
        </p>
      </header>

      <EmailDeliveryCard status={emailStatus} defaultTo={adminEmail} />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <TabButton active={tab === 'templates'} onClick={() => setTab('templates')} icon={<Mail className="size-4" />}>
          Templates
        </TabButton>
        <TabButton active={tab === 'activity'} onClick={() => setTab('activity')} icon={<Clock className="size-4" />}>
          Activity
          {queued > 0 ? <Badge tone="info" className="ml-1.5">{queued} queued</Badge> : null}
        </TabButton>
      </div>

      {tab === 'templates' ? (
        <div className="grid gap-2.5">
          {templates.map((t) => (
            <button
              key={t.event}
              onClick={() => openEditor(t)}
              className="group flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/40"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {t.immediate ? <Zap className="size-4" /> : <Clock className="size-4" />}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    {t.label}
                    {t.isActive ? null : <Badge tone="neutral">Off</Badge>}
                    {t.isCustom ? <Badge tone="info">Customised</Badge> : null}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{t.subject}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                </div>
              </div>
              <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                <Pencil className="size-3.5" /> Edit
              </span>
            </button>
          ))}
          <p className="flex items-center gap-1.5 px-1 pt-1 text-xs text-muted-foreground">
            <Mail className="size-3.5" /> Email channel. SMS and WhatsApp arrive with the Integrations phase.
          </p>
        </div>
      ) : (
        <ActivityTable activity={activity} timeZone={timeZone} onChanged={() => router.refresh()} />
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <Stat icon={<Clock className="size-4 text-amber-500" />} label="Queued" value={activity.counts.QUEUED} />
        <Stat icon={<CheckCircle2 className="size-4 text-emerald-500" />} label="Sent" value={activity.counts.SENT} />
        <Stat icon={<Mail className="size-4 text-destructive" />} label="Failed" value={activity.counts.FAILED} />
      </div>

      <TemplateEditorDrawer key={editorKey} template={editing} onOpenChange={(o) => !o && setEditing(null)} onSaved={onSaved} />
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

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      {icon}
      <div>
        <p className="text-lg font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
