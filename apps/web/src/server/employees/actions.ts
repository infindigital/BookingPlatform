'use server';

import { revalidatePath } from 'next/cache';
import { validateWeeklySchedule, type WorkingWindow } from '@booking/core';
import {
  repositoriesFor,
  writeAudit,
  getEmployeeDetail,
  type EmployeeDetail,
  type ServiceAssignmentInput,
} from '@booking/db';
import { requirePermission } from '@/server/auth/guard';
import { logger } from '@/lib/logger';

export interface EmployeeActionState {
  ok: boolean;
  error?: string;
  employeeId?: string;
}

export interface EmployeeMutationResult {
  ok: boolean;
  error?: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function refresh(): void {
  revalidatePath('/admin/employees');
  revalidatePath('/admin/calendar');
  revalidatePath('/admin');
}

/** Load a full editor payload on demand (employee detail drawer). */
export async function loadEmployeeDetail(employeeId: string): Promise<EmployeeDetail | null> {
  const session = await requirePermission('employee.manage');
  if (!employeeId) return null;
  return getEmployeeDetail(session.user.businessId, employeeId);
}

export async function createEmployeeAction(
  _prev: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const session = await requirePermission('employee.manage');
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const phone = String(formData.get('phone') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();

  if (!firstName) return { ok: false, error: 'A first name is required.' };
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: 'Enter a valid email or leave it blank.' };

  try {
    const repos = repositoriesFor(session.user.businessId);
    const employee = await repos.employees.create({
      firstName,
      lastName,
      email: email || null,
      phone: phone || null,
      title: title || null,
      isActive: true,
    });
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'employee.create',
      entity: 'Employee',
      entityId: employee.id,
    });
    refresh();
    return { ok: true, employeeId: employee.id };
  } catch (error) {
    logger.error('employee.create.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not create the team member. Please try again.' };
  }
}

export async function updateEmployeeAction(
  _prev: EmployeeActionState,
  formData: FormData,
): Promise<EmployeeActionState> {
  const session = await requirePermission('employee.manage');
  const id = String(formData.get('employeeId') ?? '');
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const phone = String(formData.get('phone') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const isActive = String(formData.get('isActive') ?? '') === 'on';

  if (!id) return { ok: false, error: 'Missing team member.' };
  if (!firstName) return { ok: false, error: 'A first name is required.' };
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: 'Enter a valid email or leave it blank.' };

  const repos = repositoriesFor(session.user.businessId);
  const existing = await repos.employees.getById(id);
  if (!existing) return { ok: false, error: 'That team member could not be found.' };

  try {
    await repos.employees.update(id, {
      firstName,
      lastName,
      email: email || null,
      phone: phone || null,
      title: title || null,
      isActive,
    });
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'employee.update',
      entity: 'Employee',
      entityId: id,
    });
    refresh();
    return { ok: true, employeeId: id };
  } catch (error) {
    logger.error('employee.update.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not save the team member. Please try again.' };
  }
}

export async function setEmployeeServicesAction(input: {
  employeeId: string;
  services: ServiceAssignmentInput[];
}): Promise<EmployeeMutationResult> {
  const session = await requirePermission('employee.manage');
  if (!input.employeeId) return { ok: false, error: 'Missing team member.' };

  const repos = repositoriesFor(session.user.businessId);
  const employee = await repos.employees.getById(input.employeeId);
  if (!employee) return { ok: false, error: 'That team member could not be found.' };

  // Reject malformed price overrides before touching the database.
  for (const s of input.services) {
    if (s.priceOverride !== null && s.priceOverride !== undefined && (!Number.isFinite(s.priceOverride) || s.priceOverride < 0)) {
      return { ok: false, error: 'Price overrides must be zero or more.' };
    }
  }

  try {
    await repos.employees.setServices(input.employeeId, input.services);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'employee.services.set',
      entity: 'Employee',
      entityId: input.employeeId,
      metadata: { count: input.services.length },
    });
    refresh();
    return { ok: true };
  } catch (error) {
    logger.error('employee.services.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not update services. Please try again.' };
  }
}

export async function saveEmployeeHoursAction(input: {
  employeeId: string;
  windows: WorkingWindow[];
}): Promise<EmployeeMutationResult> {
  const session = await requirePermission('employee.manage');
  if (!input.employeeId) return { ok: false, error: 'Missing team member.' };

  const validation = validateWeeklySchedule(input.windows);
  if (!validation.ok) return { ok: false, error: validation.error };

  const repos = repositoriesFor(session.user.businessId);
  const employee = await repos.employees.getById(input.employeeId);
  if (!employee) return { ok: false, error: 'That team member could not be found.' };

  try {
    await repos.employees.replaceWeeklyHours(
      input.employeeId,
      input.windows.map((w) => ({
        dayOfWeek: w.dayOfWeek,
        startTime: w.startTime,
        endTime: w.endTime,
        breaks: w.breaks.map((b) => ({ startTime: b.startTime, endTime: b.endTime, label: b.label ?? null })),
      })),
    );
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'employee.hours.set',
      entity: 'Employee',
      entityId: input.employeeId,
      metadata: { days: input.windows.length },
    });
    refresh();
    return { ok: true };
  } catch (error) {
    logger.error('employee.hours.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not save working hours. Please try again.' };
  }
}

export async function addEmployeeTimeOffAction(input: {
  employeeId: string;
  startAt: string;
  endAt: string;
  reason?: string | null;
}): Promise<EmployeeMutationResult> {
  const session = await requirePermission('employee.manage');
  if (!input.employeeId) return { ok: false, error: 'Missing team member.' };

  const start = new Date(input.startAt);
  const end = new Date(input.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { ok: false, error: 'Enter valid dates.' };
  if (end <= start) return { ok: false, error: 'The end must be after the start.' };

  const repos = repositoriesFor(session.user.businessId);
  const employee = await repos.employees.getById(input.employeeId);
  if (!employee) return { ok: false, error: 'That team member could not be found.' };

  try {
    await repos.employees.addTimeOff(input.employeeId, { startAt: start, endAt: end, reason: input.reason?.trim() || null });
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'employee.timeoff.add',
      entity: 'Employee',
      entityId: input.employeeId,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    logger.error('employee.timeoff.add.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not add time off. Please try again.' };
  }
}

export async function removeEmployeeTimeOffAction(input: {
  employeeId: string;
  timeOffId: string;
}): Promise<EmployeeMutationResult> {
  const session = await requirePermission('employee.manage');
  if (!input.employeeId || !input.timeOffId) return { ok: false, error: 'Missing time off entry.' };

  const repos = repositoriesFor(session.user.businessId);
  const employee = await repos.employees.getById(input.employeeId);
  if (!employee) return { ok: false, error: 'That team member could not be found.' };

  try {
    await repos.employees.removeTimeOff(input.timeOffId);
    await writeAudit({
      businessId: session.user.businessId,
      actorUserId: session.user.id,
      action: 'employee.timeoff.remove',
      entity: 'Employee',
      entityId: input.employeeId,
    });
    refresh();
    return { ok: true };
  } catch (error) {
    logger.error('employee.timeoff.remove.failed', { message: (error as Error)?.message });
    return { ok: false, error: 'Could not remove time off. Please try again.' };
  }
}
