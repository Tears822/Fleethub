"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Pencil, Trash2, Users } from "lucide-react";
import type { TenantUserSettingsRow } from "@/features/settings/server/users.queries";
import {
  labelToRole,
  splitFullName,
  type UserRoleLabel,
} from "@/features/settings/lib/tenant-user-roles";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";
import { VuiPanel } from "@/shared/ui/vui-panel";

const CREATE_ROLES: UserRoleLabel[] = ["Admin", "Gestor", "Solo lectura"];
const EDIT_ROLES: UserRoleLabel[] = ["Admin", "Gestor", "Solo lectura"];

export type CompanyOption = { id: string; legalName: string };

type UserPanel = { mode: "create" } | { mode: "edit"; userId: string } | null;

type UserFormState = {
  name: string;
  email: string;
  role: UserRoleLabel;
  companyIds: string[];
  isActive: boolean;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function emptyForm(role: UserRoleLabel = "Gestor", companyIds: string[] = []): UserFormState {
  return { name: "", email: "", role, companyIds, isActive: true };
}

function userToForm(user: TenantUserSettingsRow): UserFormState {
  return {
    name: user.name,
    email: user.email,
    role: user.role,
    companyIds: [...user.companyIds],
    isActive: user.isActive,
  };
}

function CompanyChecklist({
  companies,
  selectedIds,
  onChange,
  disabled,
}: {
  companies: CompanyOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslations();
  const toggle = (id: string) => {
    if (disabled) return;
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  if (companies.length === 0) {
    return <p className="text-xs text-zinc-500">{t("config.users.noCompanies")}</p>;
  }

  return (
    <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-2">
      {companies.map((c) => (
        <li key={c.id}>
          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50">
            <input
              type="checkbox"
              checked={selectedIds.includes(c.id)}
              onChange={() => toggle(c.id)}
              disabled={disabled}
              className="h-4 w-4 rounded border-zinc-300 text-orange-500"
            />
            <span className="truncate">{c.legalName}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function UserInlineForm({
  title,
  mode,
  form,
  companies,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  title: string;
  mode: "create" | "edit";
  form: UserFormState;
  companies: CompanyOption[];
  onChange: (next: UserFormState) => void;
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
}) {
  const { t } = useTranslations();
  const roles = mode === "create" ? CREATE_ROLES : EDIT_ROLES;

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/80 p-4">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          placeholder={t("config.users.fullName")}
          className="erp-inline-input w-full text-left sm:col-span-2"
          aria-label={t("config.users.fullName")}
        />
        <input
          type="email"
          value={form.email}
          onChange={(e) => onChange({ ...form, email: e.target.value })}
          placeholder={t("config.users.email")}
          className="erp-inline-input w-full text-left sm:col-span-2"
          aria-label={t("config.users.email")}
        />
        <select
          value={form.role}
          onChange={(e) => onChange({ ...form, role: e.target.value as UserRoleLabel })}
          className="erp-inline-input w-full text-left"
          aria-label={t("config.users.role")}
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {mode === "edit" ? (
          <label className="flex items-center gap-2 self-center text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => onChange({ ...form, isActive: e.target.checked })}
              className="h-4 w-4 rounded border-zinc-300 text-orange-500"
            />
            {t("config.users.userActive")}
          </label>
        ) : (
          <p className="self-center text-xs text-zinc-500">{t("config.users.inviteByEmail")}</p>
        )}
        <div className="sm:col-span-2">
          <p className="text-xs font-medium text-zinc-600">{t("config.users.assignedCompanies")}</p>
          <CompanyChecklist
            companies={companies}
            selectedIds={form.companyIds}
            onChange={(companyIds) => onChange({ ...form, companyIds })}
            disabled={saving}
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="erp-btn-outline px-4 py-2 normal-case">
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="erp-btn-primary px-5 py-2 normal-case"
        >
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </div>
  );
}

type ConfiguracionUsersSectionProps = {
  users: TenantUserSettingsRow[];
  companies: CompanyOption[];
  currentUserId: string;
};

export function ConfiguracionUsersSection({
  users: initialUsers,
  companies,
  currentUserId,
}: ConfiguracionUsersSectionProps) {
  const { t } = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const [userPanel, setUserPanel] = useState<UserPanel>(null);
  const [userForm, setUserForm] = useState<UserFormState>(() =>
    emptyForm("Gestor", companies[0] ? [companies[0].id] : []),
  );
  const [saving, setSaving] = useState(false);

  const defaultCompanyIds = useMemo(
    () => (companies.length > 0 ? [companies[0]!.id] : []),
    [companies],
  );

  const closePanel = useCallback(() => {
    setUserPanel(null);
    setUserForm(emptyForm("Gestor", defaultCompanyIds));
  }, [defaultCompanyIds]);

  const openCreate = useCallback(() => {
    setUserPanel({ mode: "create" });
    setUserForm(emptyForm("Gestor", defaultCompanyIds));
  }, [defaultCompanyIds]);

  const openEdit = useCallback(
    (userId: string) => {
      const user = initialUsers.find((u) => u.id === userId);
      if (!user) return;
      setUserPanel({ mode: "edit", userId });
      setUserForm(userToForm(user));
    },
    [initialUsers],
  );

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleSave = useCallback(async () => {
    const name = userForm.name.trim();
    const email = userForm.email.trim().toLowerCase();
    if (!name || !email) {
      toast.error(t("config.users.nameEmailRequired"));
      return;
    }
    if (userForm.companyIds.length === 0) {
      toast.error(t("config.users.selectCompany"));
      return;
    }

    const { firstName, lastName } = splitFullName(name);
    setSaving(true);

    try {
      if (userPanel?.mode === "create") {
        const res = await fetch(buildApiUrl("/api/tenant/users/invite"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            firstName,
            lastName,
            role: labelToRole(userForm.role),
            companyIds: userForm.companyIds,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          toast.error(data.error ?? t("config.users.inviteError"));
          return;
        }
        toast.success(t("config.users.inviteSent"));
        closePanel();
        refresh();
        return;
      }

      if (userPanel?.mode === "edit") {
        const res = await fetch(buildApiUrl(`/api/tenant/users/${userPanel.userId}`), {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            firstName,
            lastName,
            role: labelToRole(userForm.role),
            isActive: userForm.isActive,
            companyIds: userForm.companyIds,
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          toast.error(data.error ?? t("config.users.userUpdateError"));
          return;
        }
        toast.success(t("config.users.userUpdated"));
        closePanel();
        refresh();
      }
    } catch {
      toast.error(t("common.apiConnectionError"));
    } finally {
      setSaving(false);
    }
  }, [closePanel, refresh, t, toast, userForm, userPanel]);

  const handleResendInvite = useCallback(
    async (userId: string) => {
      const user = initialUsers.find((u) => u.id === userId);
      if (!user?.pendingActivation) {
        toast.info(t("config.users.resendPendingOnly"));
        return;
      }
      setSaving(true);
      try {
        const res = await fetch(buildApiUrl(`/api/tenant/users/${userId}/resend-invite`), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          toast.error(data.error ?? t("config.users.resendError"));
          return;
        }
        toast.success(t("config.users.inviteResent", { email: user.email }));
      } catch {
        toast.error(t("common.apiConnectionError"));
      } finally {
        setSaving(false);
      }
    },
    [initialUsers, t, toast],
  );

  const handleDelete = useCallback(
    async (userId: string) => {
      const user = initialUsers.find((u) => u.id === userId);
      if (!user) return;
      if (userId === currentUserId) {
        toast.error(t("config.users.cannotDeleteSelf"));
        return;
      }

      const confirmMsg = user.pendingActivation
        ? t("config.users.deleteInviteConfirm", { name: user.name })
        : t("config.users.deleteUserConfirm", { name: user.name });
      if (!window.confirm(confirmMsg)) return;

      setSaving(true);
      try {
        const res = await fetch(buildApiUrl(`/api/tenant/users/${userId}`), {
          method: "DELETE",
          credentials: "include",
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          toast.error(data.error ?? t("config.users.deleteError"));
          return;
        }
        toast.success(t("config.users.userDeleted", { name: user.name }));
        if (userPanel?.mode === "edit" && userPanel.userId === userId) closePanel();
        refresh();
      } catch {
        toast.error(t("common.apiConnectionError"));
      } finally {
        setSaving(false);
      }
    },
    [closePanel, currentUserId, initialUsers, refresh, t, toast, userPanel],
  );

  return (
    <VuiPanel className="p-5 md:p-6">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
          <Users className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <h2 className="text-sm font-semibold text-zinc-900">{t("config.users.title")}</h2>
      </div>

      {initialUsers.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("config.users.noUsers")}</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {initialUsers.map((user) => {
            const isEditing = userPanel?.mode === "edit" && userPanel.userId === user.id;
            return (
              <li
                key={user.id}
                className={`flex flex-wrap items-center gap-3 py-3.5 first:pt-0 last:pb-0 ${!user.isActive ? "opacity-60" : ""}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-800 text-sm font-bold text-amber-50">
                  {initials(user.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-900">{user.name}</p>
                  <p className="text-xs text-zinc-500">{user.email}</p>
                  {user.companyNames.length > 0 ? (
                    <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                      {user.companyNames.join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {!user.isActive ? (
                    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-600">
                      {t("config.users.inactive")}
                    </span>
                  ) : null}
                  {user.pendingActivation ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                      {t("config.users.pending")}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-orange-800">
                    {user.role}
                  </span>
                  {user.pendingActivation && user.isActive ? (
                    <button
                      type="button"
                      onClick={() => void handleResendInvite(user.id)}
                      className="rounded-lg border border-zinc-200 p-2 text-zinc-500 transition hover:border-orange-200 hover:text-orange-600"
                      aria-label={`Reenviar invitación a ${user.name}`}
                      disabled={saving}
                      title={t("config.users.resendInvite")}
                    >
                      <Mail className="h-4 w-4" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => openEdit(user.id)}
                    className={`rounded-lg border p-2 transition ${
                      isEditing
                        ? "border-orange-400 bg-orange-50 text-orange-700 ring-2 ring-orange-400/40"
                        : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-900"
                    }`}
                    aria-label={`Editar ${user.name}`}
                    aria-pressed={isEditing}
                    disabled={saving}
                    title={t("common.edit")}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {user.id !== currentUserId ? (
                    <button
                      type="button"
                      onClick={() => void handleDelete(user.id)}
                      className="erp-btn-outline inline-flex items-center gap-1 border-red-200 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 hover:border-red-300 hover:bg-red-50"
                      aria-label={`Eliminar ${user.name}`}
                      title={t("config.users.deleteUser")}
                      disabled={saving}
                    >
                      <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {t("common.delete")}
                    </button>
                  ) : user.id === currentUserId ? (
                    <span
                      className="rounded-lg border border-dashed border-zinc-200 px-2.5 py-1.5 text-[10px] text-zinc-400"
                      title={t("config.users.cannotDeleteSelf")}
                    >
                      {t("config.users.yourAccount")}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {userPanel?.mode === "edit" ? (
        <UserInlineForm
          title={t("config.users.editUser")}
          mode="edit"
          form={userForm}
          companies={companies}
          onChange={setUserForm}
          onCancel={closePanel}
          onSave={() => void handleSave()}
          saving={saving}
        />
      ) : null}

      {userPanel?.mode === "create" ? (
        <UserInlineForm
          title={t("config.users.newUser")}
          mode="create"
          form={userForm}
          companies={companies}
          onChange={setUserForm}
          onCancel={closePanel}
          onSave={() => void handleSave()}
          saving={saving}
        />
      ) : null}

      <button
        type="button"
        onClick={openCreate}
        disabled={saving || companies.length === 0}
        className={`erp-btn-primary mt-5 w-full border-2 ${
          userPanel?.mode === "create" ? "border-zinc-900" : "border-transparent"
        }`}
      >
        {t("config.users.addNewUser")}
      </button>
      <p className="mt-3 text-center text-[11px] text-zinc-500">{t("config.users.footerHint")}</p>
    </VuiPanel>
  );
}
