import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Crown,
  BarChart3,
  FileText,
  Database,
  RefreshCw,
  X,
  Trash2,
  RotateCcw,
  Search,
  ArrowUp,
  ArrowDown,
  Save,
  Gift,
  Tag,
  TrendingUp,
  Users,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../../api.ts';
import type {
  UserProfile,
  AdminSectionKey,
  AdminActionKey,
  AdminSectionDefinition,
  AdminSectionPermissionRecord,
  AdminPermissionHistoryEntry,
  VipFeatureKey,
  VipFeatureConfig,
  VipFeatureManagementState,
  ExamRecord,
  LearningLibraryResource,
  VipExclusiveAnnouncement,
  PrioritySupportTicket,
  ReferralRecord,
  AdvancedAdminAnalyticsResponse,
  AdminAuditLogEntry,
  DatabaseBackupSnapshot,
  AdminReferralManagementResponse,
  UserReferralPermissions,
  ReferralDiscountConfig,
} from '../../types.ts';

// ============================================================================
// 1. ADMIN CONTROL SECTION (Super Admin Only - Strictly Separate from VIP Features)
// ============================================================================
export const AdminControlTab: React.FC<{ onPermissionsChanged?: () => void }> = ({
  onPermissionsChanged,
}) => {
  const [registry, setRegistry] = useState<AdminSectionDefinition[]>([]);
  const [admins, setAdmins] = useState<
    (UserProfile & { permissions: Record<AdminSectionKey, AdminSectionPermissionRecord> })[]
  >([]);
  const [history, setHistory] = useState<AdminPermissionHistoryEntry[]>([]);
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<
    Record<AdminSectionKey, AdminSectionPermissionRecord> | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Promote existing user by email or create Normal Admin
  const [promoteEmail, setPromoteEmail] = useState('');
  const [promotePassword, setPromotePassword] = useState('');
  const [promoting, setPromoting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getAdminControlData();
      setRegistry(data.registry || []);
      setAdmins(data.admins || []);
      setHistory(data.history || []);

      const normalAdmins = (data.admins || []).filter((a) => a.role === 'admin');
      if (normalAdmins.length > 0) {
        const target =
          normalAdmins.find((a) => a.id === selectedAdminId) || normalAdmins[0];
        setSelectedAdminId(target.id);
        setDraftPermissions(JSON.parse(JSON.stringify(target.permissions)));
      } else {
        setSelectedAdminId(null);
        setDraftPermissions(null);
      }
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load Admin Control data',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedAdminId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedAdmin = admins.find((a) => a.id === selectedAdminId) || null;

  const handleSelectAdmin = (adminId: string) => {
    setSelectedAdminId(adminId);
    const found = admins.find((a) => a.id === adminId);
    if (found) {
      setDraftPermissions(JSON.parse(JSON.stringify(found.permissions)));
    }
  };

  const handleToggleSectionEnabled = (sectionKey: AdminSectionKey) => {
    if (!draftPermissions) return;
    const current = draftPermissions[sectionKey];
    if (!current) return;
    const nextVal = !current.enabled;
    const updated: AdminSectionPermissionRecord = {
      ...current,
      enabled: nextVal,
      actions: {
        view: nextVal,
        add: nextVal ? current.actions.add : false,
        edit: nextVal ? current.actions.edit : false,
        delete: nextVal ? current.actions.delete : false,
        approve: nextVal ? current.actions.approve : false,
        reject: nextVal ? current.actions.reject : false,
      },
    };
    setDraftPermissions({
      ...draftPermissions,
      [sectionKey]: updated,
    });
  };

  const handleToggleAction = (sectionKey: AdminSectionKey, actionKey: AdminActionKey) => {
    if (!draftPermissions) return;
    const current = draftPermissions[sectionKey];
    if (!current) return;
    const nextVal = !current.actions[actionKey];
    const nextActions = {
      ...current.actions,
      [actionKey]: nextVal,
    };
    let nextEnabled = current.enabled;
    if (actionKey === 'view' && !nextVal) {
      nextEnabled = false;
    } else if (nextVal) {
      nextEnabled = true;
      nextActions.view = true;
    }

    setDraftPermissions({
      ...draftPermissions,
      [sectionKey]: {
        ...current,
        enabled: nextEnabled,
        actions: nextActions,
      },
    });
  };

  const handleSavePermissions = async () => {
    if (!selectedAdminId || !draftPermissions || saving) return;
    try {
      setSaving(true);
      setNotice(null);
      const res = await api.updateAdminPermissions(selectedAdminId, draftPermissions);
      setNotice({ type: 'success', text: res.message });
      await loadData();
      if (onPermissionsChanged) onPermissionsChanged();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save permissions',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    if (!selectedAdminId || saving) return;
    try {
      setSaving(true);
      setNotice(null);
      const res = await api.resetAdminPermissions(selectedAdminId);
      setNotice({ type: 'success', text: res.message });
      await loadData();
      if (onPermissionsChanged) onPermissionsChanged();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to reset permissions',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeAdminRole = async (adminId: string) => {
    if (saving) return;
    try {
      setSaving(true);
      const res = await api.changeAdminRole(adminId, 'user');
      setNotice({ type: 'success', text: res.message });
      await loadData();
      if (onPermissionsChanged) onPermissionsChanged();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to revoke Admin access',
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePromoteOrCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoteEmail.trim() || promoting) return;
    try {
      setPromoting(true);
      setNotice(null);
      await api.createOrUpdateAdmin(
        promoteEmail.trim().toLowerCase(),
        promotePassword.trim() || undefined,
        'admin'
      );
      setPromoteEmail('');
      setPromotePassword('');
      setNotice({
        type: 'success',
        text: 'Normal Admin account promoted/configured with the 5 default allowed sections (Dashboard, Platform, User Management, Payment Management, Announcements).',
      });
      await loadData();
      if (onPermissionsChanged) onPermissionsChanged();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to promote/create Normal Admin',
      });
    } finally {
      setPromoting(false);
    }
  };

  const normalAdmins = admins.filter((a) => a.role === 'admin');

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#FF2525]" />
            <span>ADMIN CONTROL — Dynamic Section & Action Permissions</span>
          </h2>
          <p className="text-xs text-[#929292] mt-1">
            Manage Normal Admin access dynamically without code changes. Normal Admins receive 5 default sections upon promotion; Super Admin retains unrestricted full control.
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          className="px-3 py-1.5 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] text-xs font-bold inline-flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {notice && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 ${
            notice.type === 'success'
              ? 'bg-[#1D1D1D]/60 border-[#C5C5C5]/60 text-[#F5F5F5]'
              : 'bg-[#FF2525]/15 border-[#FF2525]/55 text-[#FF2525]'
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Promote / Add Normal Admin Form */}
      <form
        onSubmit={handlePromoteOrCreateAdmin}
        className="p-4 rounded-2xl bg-[#141414] border border-[#454545] space-y-3"
      >
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#FF2525]">
          Promote User to Normal Admin (5 Default Sections Enabled Automatically)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <input
            type="email"
            required
            placeholder="User or Admin Email Address"
            value={promoteEmail}
            onChange={(e) => setPromoteEmail(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#090909] border border-[#454545] text-xs text-white"
          />
          <input
            type="password"
            placeholder="Password (only if creating new account)"
            value={promotePassword}
            onChange={(e) => setPromotePassword(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#090909] border border-[#454545] text-xs text-white"
          />
          <button
            type="submit"
            disabled={promoting}
            className="px-4 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white font-extrabold text-xs uppercase tracking-wider"
          >
            {promoting ? 'Promoting...' : 'Promote / Add Normal Admin'}
          </button>
        </div>
      </form>

      {/* Admin Selector & Permission Matrix */}
      <div className="p-4 rounded-2xl bg-[#141414] border border-[#454545] space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-[#C5C5C5]">Select Normal Admin:</span>
            {normalAdmins.length === 0 ? (
              <span className="text-xs text-[#FF762E]">
                No Normal Admin accounts yet. Promote an account above to configure permissions.
              </span>
            ) : (
              normalAdmins.map((adm) => (
                <button
                  key={adm.id}
                  type="button"
                  onClick={() => handleSelectAdmin(adm.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    selectedAdminId === adm.id
                      ? 'bg-[#FF2525] text-white border-[#FF2525]/50'
                      : 'bg-[#141414] text-[#C5C5C5] border-[#454545]'
                  }`}
                >
                  {adm.email}
                </button>
              ))
            )}
          </div>

          {selectedAdmin && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetDefaults}
                disabled={saving}
                className="px-3 py-1.5 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#FF762E] text-xs font-bold inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to 5 Default Sections</span>
              </button>
              <button
                type="button"
                onClick={() => handleRevokeAdminRole(selectedAdmin.id)}
                disabled={saving}
                className="px-3 py-1.5 rounded-xl bg-[#FF2525]/15 hover:bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] text-xs font-bold"
              >
                Revoke Admin Role
              </button>
            </div>
          )}
        </div>

        {/* Permission Matrix Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#454545] text-[10px] uppercase tracking-wider text-[#929292]">
                <th className="py-2.5 px-2">Section</th>
                <th className="py-2.5 px-2">Normal Admin Default</th>
                <th className="py-2.5 px-2">Super Admin</th>
                {selectedAdmin && draftPermissions && (
                  <>
                    <th className="py-2.5 px-2 text-center">Section Access</th>
                    <th className="py-2.5 px-2 text-center">View</th>
                    <th className="py-2.5 px-2 text-center">Add</th>
                    <th className="py-2.5 px-2 text-center">Edit</th>
                    <th className="py-2.5 px-2 text-center">Delete</th>
                    <th className="py-2.5 px-2 text-center">Approve</th>
                    <th className="py-2.5 px-2 text-center">Reject</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#454545]/70">
              {registry.map((sec) => {
                const perm = draftPermissions?.[sec.key];
                const isSuperAdminOnly = Boolean(sec.superAdminOnly);

                return (
                  <tr key={sec.key} className="hover:bg-[#141414]/40">
                    <td className="py-2.5 px-2">
                      <span className="font-extrabold text-white block">{sec.label}</span>
                      <span className="text-[10px] text-[#929292]">{sec.description}</span>
                    </td>
                    <td className="py-2.5 px-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          sec.normalAdminDefault
                            ? 'bg-[#FF2525]/15 text-[#F5F5F5] border border-[#C5C5C5]/60'
                            : 'bg-[#1D1D1D] text-[#929292]'
                        }`}
                      >
                        {sec.normalAdminDefault ? 'Allowed' : 'Restricted'}
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FF762E]/15 text-[#FF762E] border border-[#FF762E]/50">
                        Full
                      </span>
                    </td>

                    {selectedAdmin && draftPermissions && (
                      <>
                        <td className="py-2.5 px-2 text-center">
                          <button
                            type="button"
                            disabled={isSuperAdminOnly}
                            onClick={() => handleToggleSectionEnabled(sec.key)}
                            className={`px-2.5 py-1 rounded-lg font-extrabold text-[10px] uppercase ${
                              isSuperAdminOnly
                                ? 'bg-[#141414] text-slate-600 cursor-not-allowed'
                                : perm?.enabled
                                ? 'bg-[#FF2525] text-white'
                                : 'bg-[#FF2525]/15 text-[#FF2525] border border-[#FF2525]/55'
                            }`}
                          >
                            {isSuperAdminOnly ? 'Super Admin Only' : perm?.enabled ? 'Enabled' : 'Disabled'}
                          </button>
                        </td>
                        {(['view', 'add', 'edit', 'delete', 'approve', 'reject'] as AdminActionKey[]).map((actKey) => {
                          const supported = sec.supportedActions.includes(actKey);
                          return (
                            <td key={actKey} className="py-2.5 px-2 text-center">
                              {supported ? (
                                <input
                                  type="checkbox"
                                  disabled={isSuperAdminOnly}
                                  checked={Boolean(perm?.actions?.[actKey])}
                                  onChange={() => handleToggleAction(sec.key, actKey)}
                                  className="w-4 h-4 accent-[#FF2525] rounded cursor-pointer disabled:opacity-30"
                                />
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                          );
                        })}
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selectedAdmin && draftPermissions && (
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={handleSavePermissions}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white font-extrabold text-xs uppercase tracking-wider shadow-lg"
            >
              {saving ? 'Saving Permissions...' : `Save Permissions for ${selectedAdmin.email}`}
            </button>
          </div>
        )}
      </div>

      {/* Permission Change History */}
      <div className="p-4 rounded-2xl bg-[#141414] border border-[#454545] space-y-3">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#C5C5C5]">
          Admin Permission Change History
        </h3>
        {history.length === 0 ? (
          <p className="text-xs text-[#929292]">No permission changes recorded yet.</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {history.slice(0, 25).map((h) => (
              <div
                key={h.id}
                className="p-3 rounded-xl bg-[#090909] border border-[#454545] flex items-center justify-between gap-2 text-xs"
              >
                <div>
                  <span className="font-bold text-white">{h.target_id}</span> —{' '}
                  <span className="text-[#C5C5C5]">{h.description}</span>
                  <span className="block text-[10px] text-[#929292]">
                    By {h.admin_email} · {new Date(h.timestamp).toLocaleString()}
                  </span>
                </div>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#FF2525]/20 text-[#FF2525]">
                  {h.action_type}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 2. VIP FEATURE MANAGEMENT SECTION (Super Admin Only - Global Master + 14 Switches)
// ============================================================================
export const VipFeatureManagementTab: React.FC = () => {
  const [featureState, setFeatureState] = useState<VipFeatureManagementState | null>(null);
  const [globalExams, setGlobalExams] = useState<ExamRecord[]>([]);
  const [resources, setResources] = useState<LearningLibraryResource[]>([]);
  const [vipAnnouncements, setVipAnnouncements] = useState<VipExclusiveAnnouncement[]>([]);
  const [tickets, setTickets] = useState<PrioritySupportTicket[]>([]);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Sub-manager forms
  const [newExamTitle, setNewExamTitle] = useState('');
  const [newExamSubject, setNewExamSubject] = useState('');
  const [newExamDate, setNewExamDate] = useState('');

  const [newAnnTitle, setNewAnnTitle] = useState('');
  const [newAnnContent, setNewAnnContent] = useState('');

  const [replyText, setReplyText] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getAdminVipFeaturesData();
      setFeatureState(data.state);
      setGlobalExams(data.global_exams || []);
      setResources(data.resources || []);
      setVipAnnouncements(data.vip_announcements || []);
      setTickets(data.support_tickets || []);
      setReferrals(data.referrals || []);
    } catch {
      // Ignore error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleToggleMaster = async (enabled: boolean) => {
    if (toggling) return;
    try {
      setToggling(true);
      const res = await api.setGlobalVipMasterSwitch(enabled);
      setFeatureState(res.state);
      setNotice(res.message);
      setTimeout(() => setNotice(null), 4000);
    } finally {
      setToggling(false);
    }
  };

  const handleToggleIndividual = async (key: VipFeatureKey, enabled: boolean) => {
    if (toggling) return;
    try {
      setToggling(true);
      const res = await api.toggleIndividualVipFeature(key, enabled);
      setFeatureState(res.state);
      setNotice(res.message);
      setTimeout(() => setNotice(null), 4000);
    } finally {
      setToggling(false);
    }
  };

  const handleAddGlobalExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExamTitle.trim() || !newExamDate) return;
    await api.addAdminGlobalExam({
      exam_name: newExamTitle.trim(),
      title: newExamTitle.trim(),
      subject: newExamSubject.trim() || 'Competitive Exam',
      exam_date: newExamDate,
      is_published: true,
    });
    setNewExamTitle('');
    setNewExamSubject('');
    setNewExamDate('');
    await loadData();
  };

  const handleAddVipAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnnTitle.trim() || !newAnnContent.trim()) return;
    await api.addAdminVipAnnouncement({
      title: newAnnTitle.trim(),
      content: newAnnContent.trim(),
      category: 'Important Notice',
      is_pinned: true,
    });
    setNewAnnTitle('');
    setNewAnnContent('');
    await loadData();
  };

  const [draftOrderedKeys, setDraftOrderedKeys] = useState<VipFeatureKey[]>([]);
  const [orderDirty, setOrderDirty] = useState(false);

  // Sync draftOrderedKeys whenever featureState updates
  useEffect(() => {
    if (!featureState?.features) return;
    const sorted = Object.values(featureState.features)
      .sort((a, b) => a.display_order - b.display_order)
      .map((f) => f.feature_key);
    setDraftOrderedKeys(sorted);
    setOrderDirty(false);
  }, [featureState]);

  const handleMoveFeature = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= draftOrderedKeys.length) return;
    const next = [...draftOrderedKeys];
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    setDraftOrderedKeys(next);
    setOrderDirty(true);
  };

  const handleSaveFeatureOrder = async () => {
    if (toggling || draftOrderedKeys.length === 0) return;
    try {
      setToggling(true);
      const res = await api.reorderAdminVipFeatures(draftOrderedKeys);
      setFeatureState(res.state);
      setOrderDirty(false);
      setNotice(res.message);
      setTimeout(() => setNotice(null), 4000);
    } finally {
      setToggling(false);
    }
  };

  const handleResetFeatureOrder = async () => {
    if (toggling) return;
    try {
      setToggling(true);
      const res = await api.resetAdminVipFeaturesOrder();
      setFeatureState(res.state);
      setOrderDirty(false);
      setNotice(res.message);
      setTimeout(() => setNotice(null), 4000);
    } finally {
      setToggling(false);
    }
  };

  if (loading || !featureState) {
    return <div className="p-6 text-xs text-[#929292]">Loading VIP Feature Management...</div>;
  }

  const orderedFeatures: VipFeatureConfig[] = (
    draftOrderedKeys.length > 0
      ? draftOrderedKeys.map((k) => featureState.features[k]).filter(Boolean)
      : Object.values(featureState.features || {}).sort((a, b) => a.display_order - b.display_order)
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
          <Crown className="w-5 h-5 text-[#FF762E]" />
          <span>VIP FEATURE MANAGEMENT — Global Master, 14 Switches & Feature Order</span>
        </h2>
        <p className="text-xs text-[#929292] mt-1">
          Control all 14 VIP student features and their display order on the student VIP Dashboard in real time without deleting any student records.
        </p>
      </div>

      {notice && (
        <div className="p-3.5 rounded-2xl bg-[#1D1D1D]/70 border border-[#C5C5C5]/60 text-[#F5F5F5] text-xs font-bold">
          {notice}
        </div>
      )}

      {/* A. GLOBAL VIP MASTER SWITCH */}
      <div
        className={`p-5 rounded-3xl border flex items-center justify-between gap-4 flex-wrap ${
          featureState.global_master_enabled
            ? 'bg-gradient-to-r from-amber-950/40 to-[#C90000] border-[#FF762E]/50'
            : 'bg-[#FF2525]/15 border-[#FF2525]/55'
        }`}
      >
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#FF762E]/20 text-[#FF762E]">
            A. Global VIP Master Switch
          </span>
          <h3 className="text-base font-extrabold text-white mt-1.5">
            All VIP Student Features: {featureState.global_master_enabled ? 'ACTIVE (ON)' : 'TEMPORARILY DISABLED (OFF)'}
          </h3>
          <p className="text-xs text-[#C5C5C5] mt-0.5 max-w-xl">
            Turning OFF temporarily hides all 14 VIP student features while keeping core VIP platform access, plans, and all saved individual switch states intact.
          </p>
        </div>

        <button
          type="button"
          disabled={toggling}
          onClick={() => handleToggleMaster(!featureState.global_master_enabled)}
          className={`px-5 py-3 rounded-2xl font-extrabold text-xs uppercase tracking-wider shadow-lg transition-all ${
            featureState.global_master_enabled
              ? 'bg-[#FF2525] hover:bg-[#C5C5C5]/20 text-slate-950'
              : 'bg-[#FF2525] hover:bg-[#FF2525] text-white'
          }`}
        >
          {featureState.global_master_enabled ? 'Master Switch: ON (Click to Turn OFF)' : 'Master Switch: OFF (Click to Turn ON)'}
        </button>
      </div>

      {/* B. 14 INDIVIDUAL VIP FEATURE SWITCHES + PART D FEATURE ORDER MANAGEMENT */}
      <div className="p-4 rounded-2xl bg-[#141414] border border-[#454545] space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#FF762E]">
              B. 14 Individual VIP Feature Switches & Display Order Management
            </h3>
            <p className="text-[11px] text-[#929292] mt-0.5">
              Use Move Up / Move Down to arrange how features appear in the student VIP Dashboard, then click Save Order. Feature order and ON/OFF switches are independent.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={toggling || !orderDirty}
              onClick={handleSaveFeatureOrder}
              className="px-3.5 py-2 rounded-xl bg-[#FF762E] hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 shadow-md"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Order</span>
            </button>

            <button
              type="button"
              disabled={toggling}
              onClick={handleResetFeatureOrder}
              className="px-3.5 py-2 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] font-bold text-xs inline-flex items-center gap-1.5 border border-[#454545]"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#FF762E]" />
              <span>Reset to Default Order</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {orderedFeatures.map((feat, idx) => (
            <div
              key={feat.feature_key}
              className={`p-3.5 rounded-2xl border flex flex-col justify-between gap-3 ${
                feat.is_enabled
                  ? 'bg-[#1D1D1D] border-[#454545]'
                  : 'bg-[#090909]/60 border-[#454545]/70 opacity-75'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-mono text-[#FF762E] font-bold">
                    Order #{idx + 1} · {feat.feature_key.toUpperCase()}
                  </span>
                  <h4 className="text-xs font-extrabold text-white mt-0.5">{feat.name}</h4>
                  <p className="text-[11px] text-[#929292] mt-0.5 leading-snug">{feat.description}</p>
                </div>
                <button
                  type="button"
                  disabled={toggling}
                  onClick={() => handleToggleIndividual(feat.feature_key, !feat.is_enabled)}
                  className={`px-3 py-1.5 rounded-xl font-extrabold text-[10px] uppercase shrink-0 ${
                    feat.is_enabled
                      ? 'bg-[#FF2525]/20 text-[#F5F5F5] border border-[#C5C5C5]/60'
                      : 'bg-[#FF2525]/20 text-[#FF2525] border border-[#FF2525]/55'
                  }`}
                >
                  {feat.is_enabled ? 'ON' : 'OFF'}
                </button>
              </div>

              {/* Move Up / Move Down Order Controls */}
              <div className="pt-2 border-t border-[#454545]/80 flex items-center justify-between gap-2">
                <span className="text-[10px] text-[#929292] font-semibold">
                  Position {idx + 1} of {orderedFeatures.length}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={idx === 0 || toggling}
                    onClick={() => handleMoveFeature(idx, -1)}
                    className="px-2.5 py-1 rounded-lg bg-[#141414] hover:bg-[#1D1D1D] disabled:opacity-30 border border-[#454545] text-[#F5F5F5] text-[10px] font-bold inline-flex items-center gap-1"
                    title="Move Up"
                  >
                    <ArrowUp className="w-3 h-3 text-[#FF762E]" />
                    <span>Move Up</span>
                  </button>
                  <button
                    type="button"
                    disabled={idx === orderedFeatures.length - 1 || toggling}
                    onClick={() => handleMoveFeature(idx, 1)}
                    className="px-2.5 py-1 rounded-lg bg-[#141414] hover:bg-[#1D1D1D] disabled:opacity-30 border border-[#454545] text-[#F5F5F5] text-[10px] font-bold inline-flex items-center gap-1"
                    title="Move Down"
                  >
                    <ArrowDown className="w-3 h-3 text-[#FF762E]" />
                    <span>Move Down</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* C. Content Management for Common Exams, VIP Announcements & Priority Support */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Global Official Exams */}
        <div className="p-4 rounded-2xl bg-[#141414] border border-[#454545] space-y-3">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#FF2525]">
            Official Common Exams ({globalExams.length})
          </h4>
          <form onSubmit={handleAddGlobalExam} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              required
              placeholder="Exam Title (e.g. JEE Main)"
              value={newExamTitle}
              onChange={(e) => setNewExamTitle(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#090909] border border-[#454545] text-xs text-white"
            />
            <input
              type="date"
              required
              value={newExamDate}
              onChange={(e) => setNewExamDate(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#090909] border border-[#454545] text-xs text-white"
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-xl bg-[#FF2525] text-white font-extrabold text-xs uppercase"
            >
              + Publish Exam
            </button>
          </form>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {globalExams.map((ex) => (
              <div
                key={ex.id}
                className="p-2.5 rounded-xl bg-[#090909] border border-[#454545] flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-bold text-white">{ex.exam_name}</span>
                  <span className="text-[10px] text-[#929292] block">
                    {new Date(ex.exam_date).toLocaleDateString()}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await api.deleteAdminGlobalExam(ex.id);
                    await loadData();
                  }}
                  className="text-[#FF2525] hover:text-[#FF2525] p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* VIP Exclusive Announcements */}
        <div className="p-4 rounded-2xl bg-[#141414] border border-[#454545] space-y-3">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#FF762E]">
            VIP Exclusive Announcements ({vipAnnouncements.length})
          </h4>
          <form onSubmit={handleAddVipAnnouncement} className="space-y-2">
            <input
              type="text"
              required
              placeholder="Announcement Title"
              value={newAnnTitle}
              onChange={(e) => setNewAnnTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#090909] border border-[#454545] text-xs text-white"
            />
            <div className="flex gap-2">
              <input
                type="text"
                required
                placeholder="Announcement message for VIP students..."
                value={newAnnContent}
                onChange={(e) => setNewAnnContent(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-[#090909] border border-[#454545] text-xs text-white"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#FF762E] text-slate-950 font-extrabold text-xs uppercase"
              >
                Publish
              </button>
            </div>
          </form>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {vipAnnouncements.map((a) => (
              <div
                key={a.id}
                className="p-2.5 rounded-xl bg-[#090909] border border-[#454545] flex items-center justify-between text-xs"
              >
                <div className="truncate pr-2">
                  <span className="font-bold text-[#FF762E]">{a.title}</span>
                  <p className="text-[11px] text-[#929292] truncate">{a.content}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await api.deleteAdminVipAnnouncement(a.id);
                    await loadData();
                  }}
                  className="text-[#FF2525] hover:text-[#FF2525] p-1 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Priority Support Tickets & Referral Anti-Fraud Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl bg-[#141414] border border-[#454545] space-y-3">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#F5F5F5]">
            VIP Priority Support Queue ({tickets.length})
          </h4>
          {tickets.length === 0 ? (
            <p className="text-xs text-[#929292]">No priority VIP tickets submitted yet.</p>
          ) : (
            <div className="space-y-2.5 max-h-60 overflow-y-auto">
              {tickets.map((t) => (
                <div key={t.id} className="p-3 rounded-xl bg-[#090909] border border-[#454545] space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">
                      {t.subject} ({t.user_email})
                    </span>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#FF762E]/20 text-[#FF762E]">
                      {t.status}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Reply & resolve..."
                      value={replyText[t.id] || ''}
                      onChange={(e) => setReplyText((prev) => ({ ...prev, [t.id]: e.target.value }))}
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#141414] border border-[#454545] text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        await api.replyAdminPrioritySupportTicket(t.id, {
                          message: replyText[t.id] || 'Resolved by VIP Support.',
                          status: 'Resolved',
                        });
                        setReplyText((prev) => ({ ...prev, [t.id]: '' }));
                        await loadData();
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#FF2525] text-white font-bold text-xs"
                    >
                      Reply
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 rounded-2xl bg-[#141414] border border-[#454545] space-y-3">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#FF2525]">
            VIP Referral Anti-Fraud Ledger ({referrals.length}) · Resources ({resources.length})
          </h4>
          {referrals.length === 0 ? (
            <p className="text-xs text-[#929292]">
              No referrals recorded yet. Self-referrals and duplicate device/IP attributions are blocked automatically.
            </p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {referrals.map((r) => (
                <div
                  key={r.id}
                  className="p-2.5 rounded-xl bg-[#090909] border border-[#454545] flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-white">
                      {r.referrer_email} → {r.referred_email}
                    </span>
                    <span className="text-[10px] text-[#929292] block">
                      Code: {r.referral_code} · +{r.reward_days_granted}d
                    </span>
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#FF2525]/20 text-[#F5F5F5]">
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 3. ADVANCED ADMIN ANALYTICS (Part 4)
// ============================================================================
export const AdvancedAnalyticsTab: React.FC = () => {
  const [data, setData] = useState<AdvancedAdminAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getAdvancedAdminAnalytics();
      setData(res);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  if (loading || !data) {
    return <div className="p-6 text-xs text-[#929292]">Loading Advanced Analytics...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#F5F5F5]" />
            <span>ADVANCED ADMIN ANALYTICS — Real Database Metrics</span>
          </h2>
          <p className="text-xs text-[#929292] mt-0.5">
            Live conversion, retention, Pre-Key vs In-App VIP revenue, and student activity metrics.
          </p>
        </div>
        <button
          type="button"
          onClick={loadAnalytics}
          className="px-3 py-1.5 rounded-xl bg-[#1D1D1D] text-[#F5F5F5] text-xs font-bold inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-[#141414] border border-[#454545]">
          <span className="text-[10px] font-bold uppercase text-[#929292] block">Total Revenue</span>
          <span className="text-2xl font-extrabold text-[#F5F5F5]">
            ₹{data.payments.total_approved_revenue}
          </span>
          <span className="text-[10px] text-[#929292] block mt-0.5">
            {data.payments.approved_count} Approved · {data.payments.pending_count} Pending
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-[#141414] border border-[#454545]">
          <span className="text-[10px] font-bold uppercase text-[#929292] block">Pre-Key vs In-App</span>
          <span className="text-lg font-extrabold text-[#FF762E] block">
            Pre-Key: {data.vip.pre_key_purchases}
          </span>
          <span className="text-[10px] text-[#929292] block">
            In-App: {data.vip.in_app_purchases}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-[#141414] border border-[#454545]">
          <span className="text-[10px] font-bold uppercase text-[#929292] block">VIP Lifecycle</span>
          <span className="text-2xl font-extrabold text-[#FF2525]">
            {data.vip.active_vips} Active
          </span>
          <span className="text-[10px] text-[#929292] block mt-0.5">
            {data.vip.expiring_within_7_days} Expiring 7d · {data.vip.expired_vips} Expired
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-[#141414] border border-[#454545]">
          <span className="text-[10px] font-bold uppercase text-[#929292] block">Student Streaks</span>
          <span className="text-2xl font-extrabold text-orange-400">
            {data.student_activity.active_streaks}
          </span>
          <span className="text-[10px] text-[#929292] block mt-0.5">
            7d Badges: {data.student_activity.milestone_7_days} · Tests: {data.student_activity.mock_test_attempts}
          </span>
        </div>
      </div>

      {/* VIP Feature Usage Table */}
      <div className="p-4 rounded-2xl bg-[#141414] border border-[#454545] space-y-3">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#FF762E]">
          14 VIP Features Status & Usage Activity
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {data.vip_feature_usage.map((f) => (
            <div
              key={f.feature_key}
              className="p-3 rounded-xl bg-[#090909] border border-[#454545] flex items-center justify-between text-xs"
            >
              <div>
                <span className="font-bold text-white block">{f.name}</span>
                <span className="text-[10px] text-[#929292]">Records/Interactions: {f.usage_count}</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  f.is_enabled ? 'bg-[#FF2525]/20 text-[#F5F5F5]' : 'bg-[#FF2525]/20 text-[#FF2525]'
                }`}
              >
                {f.is_enabled ? 'ON' : 'OFF'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 4. ADMIN AUDIT LOGS (Part 4 - Immutable to Normal Admins)
// ============================================================================
export const AdminAuditLogTab: React.FC = () => {
  const [logs, setLogs] = useState<AdminAuditLogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getAdminAuditLogs({
        search: search.trim() || undefined,
        section: sectionFilter || undefined,
        action: actionFilter || undefined,
        status: statusFilter || undefined,
      });
      setLogs(res.logs);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [search, sectionFilter, actionFilter, statusFilter]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const formatAuditValue = (val: unknown): string | null => {
    if (val === undefined || val === null) return null;
    if (typeof val === 'string') return val;
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#FF2525]" />
            <span>SEPARATE ADMIN AUDIT LOG — Immutable Security & Change Trail</span>
          </h2>
          <p className="text-xs text-[#929292] mt-0.5">
            Records every administrative action with Admin User ID, Admin Email, target user/record ID, old & new values, timestamp, and success/failed status. Audit logs are strictly read-only and cannot be edited or deleted by Normal Admins.
          </p>
        </div>

        <button
          type="button"
          onClick={loadLogs}
          className="px-3 py-1.5 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] text-xs font-bold inline-flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* Search & Filters Bar */}
      <div className="p-3.5 rounded-2xl bg-[#141414] border border-[#454545] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#929292] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search Admin ID, email, target ID, description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#090909] border border-[#454545] text-xs text-white"
          />
        </div>

        <select
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-[#090909] border border-[#454545] text-xs text-white"
        >
          <option value="">All Sections</option>
          <option value="users">User Management (users)</option>
          <option value="vip">VIP Management (vip)</option>
          <option value="payments">Payment Management (payments)</option>
          <option value="referral_management">Referral Management</option>
          <option value="admin_control">Admin Control & Permissions</option>
          <option value="vip_feature_management">VIP Feature Management</option>
          <option value="platforms">Platform Management</option>
          <option value="announcements">Announcements</option>
          <option value="backup_recovery">Backup & Recovery</option>
        </select>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-[#090909] border border-[#454545] text-xs text-white"
        >
          <option value="">All Action Types</option>
          <option value="device_reset">Device Reset</option>
          <option value="user_blocked">User Blocked</option>
          <option value="user_unblocked">User Unblocked</option>
          <option value="user_edited">User Edited</option>
          <option value="user_deleted">User Deleted</option>
          <option value="bulk_delete">Bulk Delete</option>
          <option value="manual_vip_grant">Manual VIP Grant</option>
          <option value="vip_revocation">VIP Revocation</option>
          <option value="payment_approved">Payment Approved</option>
          <option value="payment_rejected">Payment Rejected</option>
          <option value="permission_change">Permission Change</option>
          <option value="permission_denied">Permission Denied (Failed)</option>
          <option value="referral_switch_change">Referral Switch / Discount Change</option>
          <option value="referral_permission_change">Referral Permission Change</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-[#090909] border border-[#454545] text-xs text-white"
        >
          <option value="">All Statuses (Success & Failed)</option>
          <option value="success">Success Only</option>
          <option value="failed">Failed / Blocked Only</option>
        </select>
      </div>

      <div className="p-4 rounded-2xl bg-[#141414] border border-[#454545] space-y-2.5 max-h-[600px] overflow-y-auto">
        {loading ? (
          <p className="text-xs text-[#929292]">Loading audit logs...</p>
        ) : logs.length === 0 ? (
          <p className="text-xs text-[#929292]">No matching audit log records found.</p>
        ) : (
          logs.map((log) => {
            const status = log.status || 'success';
            const prevStr = formatAuditValue(log.previous_value);
            const nextStr = formatAuditValue(log.new_value);

            return (
              <div
                key={log.id}
                className="p-3.5 rounded-xl bg-[#090909] border border-[#454545] space-y-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                        status === 'failed'
                          ? 'bg-[#FF2525]/20 text-[#FF2525] border border-[#FF2525]/55'
                          : 'bg-[#FF2525]/20 text-[#F5F5F5] border border-[#C5C5C5]/60'
                      }`}
                    >
                      {status === 'failed' ? 'FAILED' : 'SUCCESS'}
                    </span>
                    <span className="font-mono font-extrabold text-[#FF762E] uppercase">
                      {log.action_type}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#FF2525]/20 text-[#FF2525] text-[10px] font-bold uppercase">
                      Section: {log.section}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#141414] border border-[#454545] text-[#C5C5C5] font-mono text-[10px]">
                      Related User / Record ID: {log.target_id}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-[#929292]">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>

                <p className="text-[#F5F5F5] font-semibold">{log.description}</p>

                <div className="flex items-center gap-3 flex-wrap text-[11px] text-[#929292] pt-0.5">
                  <span>
                    <strong className="text-[#C5C5C5]">Admin Email:</strong> {log.admin_email} ({log.admin_role})
                  </span>
                  <span>·</span>
                  <span className="font-mono">
                    <strong className="text-[#C5C5C5]">Admin User ID:</strong> {log.admin_id}
                  </span>
                  {log.ip_address && (
                    <>
                      <span>·</span>
                      <span className="font-mono">IP: {log.ip_address}</span>
                    </>
                  )}
                </div>

                {(prevStr !== null || nextStr !== null) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1.5">
                    <div className="p-2 rounded-lg bg-[#141414] border border-[#454545]/90 font-mono text-[10px] text-[#FF2525] break-all">
                      <span className="text-[#929292] font-bold uppercase block mb-0.5">Old Value:</span>
                      {prevStr ?? '—'}
                    </div>
                    <div className="p-2 rounded-lg bg-[#141414] border border-[#454545]/90 font-mono text-[10px] text-[#F5F5F5] break-all">
                      <span className="text-[#929292] font-bold uppercase block mb-0.5">New Value:</span>
                      {nextStr ?? '—'}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 5. DATA BACKUP & RECOVERY (Part 4 - SHA-256 Verified & Non-Destructive Restore)
// ============================================================================
export const BackupRecoveryTab: React.FC = () => {
  const [backups, setBackups] = useState<DatabaseBackupSnapshot[]>([]);
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadBackups = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getDatabaseBackups();
      setBackups(res.backups);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    try {
      setCreating(true);
      const res = await api.createDatabaseBackup(label.trim() || undefined);
      setLabel('');
      setNotice(res.message);
      await loadBackups();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (id: string) => {
    if (restoringId) return;
    try {
      setRestoringId(id);
      const res = await api.restoreDatabaseBackup(id);
      setNotice(res.message);
      await loadBackups();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
          <Database className="w-5 h-5 text-[#FF762E]" />
          <span>DATA BACKUP & NON-DESTRUCTIVE RECOVERY</span>
        </h2>
        <p className="text-xs text-[#929292] mt-1">
          Create SHA-256 integrity-verified snapshots of users, VIP memberships, payments, streaks, exams, permissions, and settings. Non-destructive restore merges missing records without overwriting newer valid data.
        </p>
      </div>

      {notice && (
        <div className="p-3.5 rounded-2xl bg-[#1D1D1D]/70 border border-[#C5C5C5]/60 text-[#F5F5F5] text-xs font-bold">
          {notice}
        </div>
      )}

      <form
        onSubmit={handleCreateBackup}
        className="p-4 rounded-2xl bg-[#141414] border border-[#454545] flex items-center gap-3 flex-wrap"
      >
        <input
          type="text"
          placeholder="Snapshot Label (e.g. Pre-Exam Season Snapshot)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="flex-1 min-w-[220px] px-3.5 py-2.5 rounded-xl bg-[#090909] border border-[#454545] text-xs text-white"
        />
        <button
          type="submit"
          disabled={creating}
          className="px-5 py-2.5 rounded-xl bg-[#FF762E] hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider"
        >
          {creating ? 'Creating SHA-256 Snapshot...' : '+ Create Verified Backup Snapshot'}
        </button>
      </form>

      <div className="space-y-3">
        {loading ? (
          <p className="text-xs text-[#929292]">Loading backup snapshots...</p>
        ) : backups.length === 0 ? (
          <p className="text-xs text-[#929292]">
            No snapshots created yet. Click "+ Create Verified Backup Snapshot" above to create one now.
          </p>
        ) : (
          backups.map((b) => (
            <div
              key={b.backup_id}
              className="p-4 rounded-2xl bg-[#141414] border border-[#454545] flex items-center justify-between gap-4 flex-wrap"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-white">{b.label}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#FF2525]/20 text-[#F5F5F5]">
                    SHA-256: {b.sha256_checksum.slice(0, 16)}...
                  </span>
                </div>
                <p className="text-[11px] text-[#929292]">
                  Created by {b.created_by} on {new Date(b.created_at).toLocaleString()} · Size:{' '}
                  {(b.size_bytes / 1024).toFixed(1)} KB
                </p>
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  {Object.entries(b.record_counts || {}).map(([k, v]) => (
                    <span
                      key={k}
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#141414] border border-[#454545] text-[#C5C5C5]"
                    >
                      {k}: {v}
                    </span>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={restoringId === b.backup_id}
                onClick={() => handleRestore(b.backup_id)}
                className="px-4 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white font-extrabold text-xs uppercase tracking-wider"
              >
                {restoringId === b.backup_id ? 'Restoring...' : 'Safe Non-Destructive Restore'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 6. REFERRAL PROGRAM MANAGEMENT SECTION (Parts F, G, H, I)
// ============================================================================
export const ReferralManagementTab: React.FC<{ onSettingsChanged?: () => void }> = ({
  onSettingsChanged,
}) => {
  const [data, setData] = useState<AdminReferralManagementResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Selected User / Admin for Individual Referral Access
  const [accountSearch, setAccountSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [draftPerms, setDraftPerms] = useState<UserReferralPermissions | null>(null);

  // Discount Config Draft
  const [discountDraft, setDiscountDraft] = useState<ReferralDiscountConfig | null>(null);

  // Per-Referrer Filter & Referral Ledger Filter
  const [selectedReferrerFilter, setSelectedReferrerFilter] = useState<string>('all');
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState<
    'all' | 'approved' | 'pending' | 'rejected' | 'not_purchased'
  >('all');
  const [ledgerSearch, setLedgerSearch] = useState('');

  const loadManagement = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getAdminReferralManagement();
      setData(res);
      setDiscountDraft(JSON.parse(JSON.stringify(res.discount_config)));

      if (res.users && res.users.length > 0) {
        const currentTarget =
          res.users.find((u) => u.id === selectedUserId) || res.users[0];
        setSelectedUserId(currentTarget.id);
        setDraftPerms(JSON.parse(JSON.stringify(currentTarget.referral_permissions)));
      }
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load Referral Management',
      });
    } finally {
      setLoading(false);
    }
  }, [selectedUserId]);

  useEffect(() => {
    void loadManagement();
  }, [loadManagement]);

  const handleToggleGlobalSwitch = async () => {
    if (!data || saving) return;
    try {
      setSaving(true);
      const nextState = !data.referral_program_enabled;
      const res = await api.setAdminReferralGlobalSwitch(nextState);
      setNotice({ type: 'success', text: res.message });
      await loadManagement();
      if (onSettingsChanged) onSettingsChanged();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update global referral switch',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSelectAccount = (uid: string) => {
    setSelectedUserId(uid);
    const found = data?.users.find((u) => u.id === uid);
    if (found) {
      setDraftPerms(JSON.parse(JSON.stringify(found.referral_permissions)));
    }
  };

  const handleSaveUserReferralPerms = async () => {
    if (!selectedUserId || !draftPerms || saving) return;
    try {
      setSaving(true);
      const res = await api.updateAdminReferralPermissions(selectedUserId, draftPerms);
      setNotice({ type: 'success', text: res.message });
      await loadManagement();
      if (onSettingsChanged) onSettingsChanged();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save user referral permissions',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDiscountConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discountDraft || saving) return;
    try {
      setSaving(true);
      const res = await api.updateAdminReferralDiscountConfig(discountDraft);
      setNotice({ type: 'success', text: res.message });
      await loadManagement();
      if (onSettingsChanged) onSettingsChanged();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update referral discount settings',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data) {
    return <div className="p-6 text-xs text-[#929292]">Loading Referral Program Management...</div>;
  }

  const filteredAccounts = data.users.filter((u) => {
    if (!accountSearch.trim()) return true;
    const q = accountSearch.trim().toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      (u.name && u.name.toLowerCase().includes(q)) ||
      u.id.toLowerCase().includes(q) ||
      u.referral_code.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const selectedAccount = data.users.find((u) => u.id === selectedUserId) || null;

  // Match Referral Code Owner whenever admin searches a Referral Code, User ID, or Email in the Search Box
  const codeLookupQuery = ledgerSearch.trim().toLowerCase();
  const matchedCodeOwners = codeLookupQuery
    ? data.users.filter(
        (u) =>
          u.referral_code.toLowerCase().includes(codeLookupQuery) ||
          u.id.toLowerCase() === codeLookupQuery ||
          u.email.toLowerCase().includes(codeLookupQuery) ||
          (u.name && u.name.toLowerCase().includes(codeLookupQuery))
      )
    : [];

  const filteredReferrals = data.referrals.filter((r) => {
    if (selectedReferrerFilter !== 'all' && r.referrer_user_id !== selectedReferrerFilter) {
      return false;
    }
    if (purchaseStatusFilter !== 'all' && (r.vip_purchase_status || 'not_purchased') !== purchaseStatusFilter) {
      return false;
    }
    if (ledgerSearch.trim()) {
      const q = ledgerSearch.trim().toLowerCase();
      return (
        r.referrer_email.toLowerCase().includes(q) ||
        r.referrer_user_id.toLowerCase().includes(q) ||
        r.referred_email.toLowerCase().includes(q) ||
        r.referred_user_id.toLowerCase().includes(q) ||
        r.referral_code.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.payment_request_id || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const leaderboardList =
    data.leaderboard && data.leaderboard.length > 0
      ? data.leaderboard
      : [...data.referrer_reports].sort((a, b) => {
          if (b.vip_purchases_count !== a.vip_purchases_count) {
            return b.vip_purchases_count - a.vip_purchases_count;
          }
          if (b.total_referrals !== a.total_referrals) {
            return b.total_referrals - a.total_referrals;
          }
          return b.verified_net_sales_inr - a.verified_net_sales_inr;
        });

  // Live preview of Optional Referral Discount calculation on a sample ₹499 plan
  const samplePlanPrice = 499;
  const isDiscountActive =
    Boolean(discountDraft?.discount_enabled) &&
    discountDraft?.discount_type !== 'none' &&
    Number(discountDraft?.discount_value || 0) > 0;
  let sampleDiscountAmount = 0;
  if (isDiscountActive && discountDraft) {
    if (discountDraft.discount_type === 'percentage') {
      const pct = Math.min(100, Math.max(0, Number(discountDraft.discount_value) || 0));
      sampleDiscountAmount = Math.round((samplePlanPrice * pct) / 100);
    } else if (discountDraft.discount_type === 'fixed') {
      sampleDiscountAmount = Math.max(0, Number(discountDraft.discount_value) || 0);
    }
    if (discountDraft.max_discount_amount > 0) {
      sampleDiscountAmount = Math.min(sampleDiscountAmount, discountDraft.max_discount_amount);
    }
    sampleDiscountAmount = Math.min(samplePlanPrice, Math.max(0, sampleDiscountAmount));
  }
  const sampleFinalPayable = Math.max(0, samplePlanPrice - sampleDiscountAmount);

  const PERMISSION_LABELS: { key: keyof UserReferralPermissions; label: string; desc: string }[] = [
    {
      key: 'can_access_referral_dashboard',
      label: 'Access Referral Dashboard',
      desc: 'Allow account to open the Referral Rewards section in VIP Dashboard.',
    },
    {
      key: 'can_view_own_referral_data',
      label: 'View Own Referral Data',
      desc: 'Allow viewing referred students list and attribution status.',
    },
    {
      key: 'can_view_referral_sales',
      label: 'View Referral VIP Sales',
      desc: 'Allow viewing verified VIP purchase counts and sales revenue generated.',
    },
    {
      key: 'can_create_share_referral_link',
      label: 'Create / Share Referral Code & Link',
      desc: 'Allow copying and sharing referral code & invite link.',
    },
    {
      key: 'can_manage_referral_settings',
      label: 'Manage Referral Settings',
      desc: 'Staff permission to edit referral discount & program rules.',
    },
    {
      key: 'can_view_referral_reports',
      label: 'View Per-Referrer Reports',
      desc: 'Staff permission to inspect all referrer sales reports.',
    },
    {
      key: 'can_access_referral_management',
      label: 'Access Admin Referral Management Tab',
      desc: 'Allow Normal Admin to open this Referral Management section.',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <Gift className="w-5 h-5 text-[#F5F5F5]" />
            <span>REFERRAL PROGRAM MANAGEMENT — Search, Leaderboard, Discounts & Sales</span>
          </h2>
          <p className="text-xs text-[#929292] mt-1">
            Search any Referral Code to inspect its owner profile, track referred users in Supabase, manage optional % or ₹ discounts, and view the Referral Leaderboard.
          </p>
        </div>
        <button
          type="button"
          onClick={loadManagement}
          className="px-3 py-1.5 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] text-xs font-bold inline-flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {notice && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 ${
            notice.type === 'success'
              ? 'bg-[#1D1D1D]/70 border-[#C5C5C5]/60 text-[#F5F5F5]'
              : 'bg-[#FF2525]/15 border-[#FF2525]/55 text-[#FF2525]'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{notice.text}</span>
          </div>
          <button type="button" onClick={() => setNotice(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* PROMINENT REFERRAL CODE OWNER SEARCH & ATTRIBUTION LOOKUP */}
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-[#FF2525] via-[#0B1120] to-[#C90000] border border-[#FF2525]/40 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#FF2525]/20 text-[#FF2525]">
              Referral Code & Owner Lookup
            </span>
            <h3 className="text-sm font-extrabold text-white mt-1">
              Search Referral Code (e.g. SF-REF-XXXXXX), User ID, or Email
            </h3>
            <p className="text-[11px] text-[#929292]">
              Enter any Referral Code to immediately view the Code Owner&apos;s User ID, email, profile details, and all users who registered or logged in using that code.
            </p>
          </div>

          <div className="relative min-w-[280px] sm:min-w-[340px]">
            <Search className="w-4 h-4 text-[#FF2525] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Enter Referral Code (SF-REF-...), Email, or User ID..."
              value={ledgerSearch}
              onChange={(e) => setLedgerSearch(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 rounded-2xl bg-[#090909] border border-[#FF2525]/50 text-xs text-white font-semibold focus:outline-none focus:border-[#C5C5C5]/60"
            />
            {ledgerSearch && (
              <button
                type="button"
                onClick={() => setLedgerSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#929292] hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {codeLookupQuery && (
          <div className="space-y-3 pt-1">
            <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-[#FF762E]">
              Matched Referral Code Owner Profile ({matchedCodeOwners.length})
            </h4>
            {matchedCodeOwners.length === 0 ? (
              <p className="text-xs text-[#FF2525] bg-[#FF2525]/15 border border-[#FF2525]/55 p-3 rounded-xl">
                No Referral Code owner found matching &ldquo;{ledgerSearch}&rdquo;.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {matchedCodeOwners.slice(0, 6).map((owner) => {
                  const ownerReferrals = data.referrals.filter(
                    (r) =>
                      r.referrer_user_id === owner.id ||
                      r.referral_code.toUpperCase() === owner.referral_code.toUpperCase()
                  );
                  return (
                    <div
                      key={owner.id}
                      className="p-4 rounded-2xl bg-[#090909]/90 border border-[#FF2525]/40 space-y-2.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-[#FF2525]/20 text-[#F5F5F5]">
                            Code Owner · {owner.role.toUpperCase()}
                          </span>
                          <h5 className="text-sm font-extrabold text-white mt-1">
                            {owner.name || 'Study Blunder User'} ({owner.email})
                          </h5>
                          <p className="text-[11px] font-mono text-[#929292] mt-0.5">
                            Owner User ID: <span className="text-[#F5F5F5] select-all">{owner.id}</span>
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] uppercase text-[#929292] block">Referral Code</span>
                          <span className="font-mono text-sm font-extrabold text-[#FF762E] select-all">
                            {owner.referral_code}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#454545] text-[11px]">
                        <div>
                          <span className="text-[#929292] block text-[10px]">Registered</span>
                          <span className="font-bold text-[#F5F5F5]">
                            {owner.created_at ? new Date(owner.created_at).toLocaleDateString() : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#929292] block text-[10px]">VIP Status</span>
                          <span className={`font-bold ${owner.vip_active ? 'text-[#F5F5F5]' : 'text-[#929292]'}`}>
                            {owner.vip_active ? 'Active VIP' : 'Standard'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#929292] block text-[10px]">Users Referred</span>
                          <span className="font-extrabold text-white">
                            {owner.total_referrals ?? ownerReferrals.length}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#929292] block text-[10px]">VIP Purchases / Bonus</span>
                          <span className="font-extrabold text-[#F5F5F5]">
                            {owner.approved_vip_purchases ?? 0} sales · +{owner.bonus_vip_days ?? 0}d
                          </span>
                        </div>
                      </div>

                      {ownerReferrals.length > 0 && (
                        <div className="pt-2 border-t border-[#454545]/80 space-y-1">
                          <span className="text-[10px] font-bold uppercase text-[#FF2525] block">
                            Users Who Used Code {owner.referral_code} ({ownerReferrals.length}):
                          </span>
                          <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                            {ownerReferrals.map((ref) => (
                              <div
                                key={ref.id}
                                className="px-2.5 py-1.5 rounded-lg bg-[#141414] border border-[#454545] flex items-center justify-between gap-2 text-[11px]"
                              >
                                <div className="truncate">
                                  <span className="font-bold text-white">{ref.referred_email}</span>
                                  <span className="text-[10px] font-mono text-[#929292] ml-1.5">
                                    (ID: {ref.referred_user_id})
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] text-[#929292]">
                                    {new Date(ref.registration_date || ref.created_at).toLocaleDateString()}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-[#FF2525]/20 text-[#F5F5F5] text-[10px] font-bold uppercase">
                                    {ref.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 1. GLOBAL REFERRAL PROGRAM SWITCH (Part F.1) */}
      <div
        className={`p-5 rounded-3xl border flex items-center justify-between gap-4 flex-wrap ${
          data.referral_program_enabled
            ? 'bg-gradient-to-r from-[#FF2525] to-[#C90000] border-[#C5C5C5]/60'
            : 'bg-[#FF2525]/15 border-[#FF2525]/55'
        }`}
      >
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#FF2525]/20 text-[#F5F5F5]">
            1. Global Referral Program Master Switch
          </span>
          <h3 className="text-base font-extrabold text-white mt-1.5">
            Referral Program Status: {data.referral_program_enabled ? 'ACTIVE (ON)' : 'DISABLED (OFF)'}
          </h3>
          <p className="text-xs text-[#C5C5C5] mt-0.5 max-w-xl">
            Even when Global Referral Program is OFF, any submitted referral code attribution is safely recorded in Supabase so attribution tracking is never lost. Discounts and rewards apply strictly according to enabled settings.
          </p>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={handleToggleGlobalSwitch}
          className={`px-5 py-3 rounded-2xl font-extrabold text-xs uppercase tracking-wider shadow-lg transition-all ${
            data.referral_program_enabled
              ? 'bg-[#FF2525] hover:bg-[#C5C5C5]/20 text-slate-950'
              : 'bg-[#FF2525] hover:bg-[#FF2525] text-white'
          }`}
        >
          {data.referral_program_enabled
            ? 'Global Referral Program: ON (Click to Turn OFF)'
            : 'Global Referral Program: OFF (Click to Turn ON)'}
        </button>
      </div>

      {/* GLOBAL REFERRAL METRICS SUMMARY */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-2xl bg-[#141414] border border-[#454545]">
          <span className="text-[10px] font-bold uppercase text-[#929292] block">Total Referrals</span>
          <span className="text-xl font-extrabold text-white mt-0.5 block">
            {data.global_metrics.total_referrals}
          </span>
          <span className="text-[10px] text-[#929292]">
            {data.global_metrics.non_purchasing_referrals} non-purchasing
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#141414] border border-[#454545]">
          <span className="text-[10px] font-bold uppercase text-[#F5F5F5] block">Approved VIP Sales</span>
          <span className="text-xl font-extrabold text-[#F5F5F5] mt-0.5 block">
            {data.global_metrics.approved_vip_purchases}
          </span>
          <span className="text-[10px] text-[#929292]">
            {data.global_metrics.pending_vip_purchases} pending · {data.global_metrics.rejected_vip_purchases} rejected
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#141414] border border-[#454545]">
          <span className="text-[10px] font-bold uppercase text-[#FF2525] block">Gross Plan Value</span>
          <span className="text-xl font-extrabold text-white mt-0.5 block">
            ₹{data.global_metrics.verified_gross_sales_inr}
          </span>
          <span className="text-[10px] text-[#929292]">Verified completed orders only</span>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#141414] border border-[#454545]">
          <span className="text-[10px] font-bold uppercase text-[#FF762E] block">Discounts Given</span>
          <span className="text-xl font-extrabold text-[#FF762E] mt-0.5 block">
            -₹{data.global_metrics.total_discounts_given_inr}
          </span>
          <span className="text-[10px] text-[#929292]">Referral savings applied</span>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#141414] border border-[#454545]">
          <span className="text-[10px] font-bold uppercase text-[#F5F5F5] block">Net Collected Sales</span>
          <span className="text-xl font-extrabold text-[#F5F5F5] mt-0.5 block">
            ₹{data.global_metrics.verified_net_sales_inr}
          </span>
          <span className="text-[10px] text-[#929292]">
            +{data.global_metrics.total_reward_days_granted} bonus days awarded
          </span>
        </div>
      </div>

      {/* REFERRAL LEADERBOARD */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#141414] border border-[#FF762E]/50 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#FF762E] flex items-center gap-1.5">
              <Crown className="w-4 h-4 text-[#FF762E]" />
              <span>Referral Leaderboard — Top Referrers, VIP Conversions & Verified Rewards</span>
            </h3>
            <p className="text-[11px] text-[#929292] mt-0.5">
              Ranked by verified VIP purchases, total referred users, and verified rewards granted. Self-referrals and duplicate attributions are strictly blocked.
            </p>
          </div>
        </div>

        {leaderboardList.length === 0 ? (
          <p className="text-xs text-[#929292]">
            No referrers on the leaderboard yet. As users register with referral codes, top referrers will appear here automatically.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#454545] text-[10px] uppercase tracking-wider text-[#929292]">
                  <th className="py-2.5 px-2">Rank</th>
                  <th className="py-2.5 px-2">Top Referrer (Email & ID)</th>
                  <th className="py-2.5 px-2">Referral Code</th>
                  <th className="py-2.5 px-2 text-center">Total Referred Users</th>
                  <th className="py-2.5 px-2 text-center">Successful VIP Purchases</th>
                  <th className="py-2.5 px-2 text-center">Verified Bonus Days</th>
                  <th className="py-2.5 px-2 text-right">Verified Net Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#454545]/70">
                {leaderboardList.slice(0, 15).map((leader, index) => (
                  <tr key={leader.referrer_user_id} className="hover:bg-[#141414]/40">
                    <td className="py-2.5 px-2">
                      <span
                        className={`px-2.5 py-1 rounded-lg font-extrabold text-[11px] ${
                          index === 0
                            ? 'bg-[#FF762E] text-slate-950'
                            : index === 1
                            ? 'bg-slate-300 text-slate-950'
                            : index === 2
                            ? 'bg-amber-700 text-white'
                            : 'bg-[#141414] text-[#C5C5C5] border border-[#454545]'
                        }`}
                      >
                        #{index + 1}
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="font-bold text-white block">{leader.referrer_email}</span>
                      <span className="text-[10px] font-mono text-[#929292]">
                        ID: {leader.referrer_user_id}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 font-mono text-[#FF762E] font-extrabold">
                      {leader.referral_code}
                    </td>
                    <td className="py-2.5 px-2 text-center font-extrabold text-white">
                      {leader.total_referrals}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span className="px-2.5 py-0.5 rounded-full bg-[#FF2525]/20 text-[#F5F5F5] font-extrabold">
                        {leader.vip_purchases_count} VIP Sales
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center font-bold text-[#FF2525]">
                      +{leader.total_reward_days_granted ?? leader.reward_days_earned ?? 0} Days
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono font-extrabold text-[#F5F5F5]">
                      ₹{leader.verified_net_sales_inr}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2. INDIVIDUAL REFERRAL ACCESS & PERMISSIONS (Part F.2) */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#141414] border border-[#454545] space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#FF2525] flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              <span>2. Individual Referral Access & Permissions (Users & Admins)</span>
            </h3>
            <p className="text-[11px] text-[#929292] mt-0.5">
              Select any User or Admin account to enable or restrict their referral dashboard, referral sales visibility, or code sharing.
            </p>
          </div>

          <div className="relative min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-[#929292] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search email, ID, or referral code..."
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#090909] border border-[#454545] text-xs text-white"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1.5 no-scrollbar">
          {filteredAccounts.slice(0, 20).map((acc) => (
            <button
              key={acc.id}
              type="button"
              onClick={() => handleSelectAccount(acc.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border whitespace-nowrap transition-all ${
                selectedUserId === acc.id
                  ? 'bg-[#FF2525] text-white border-[#FF2525]/50 shadow-md'
                  : 'bg-[#090909] text-[#C5C5C5] border-[#454545] hover:border-[#454545]'
              }`}
            >
              <span>{acc.email}</span>
              <span className="ml-1.5 text-[10px] font-mono opacity-80">({acc.referral_code})</span>
            </button>
          ))}
        </div>

        {selectedAccount && draftPerms && (
          <div className="p-4 rounded-2xl bg-[#090909] border border-[#454545] space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-[#454545] pb-2.5">
              <div>
                <span className="text-xs font-extrabold text-white">{selectedAccount.email}</span>
                <span className="ml-2 text-[10px] font-mono text-[#929292]">
                  (ID: {selectedAccount.id})
                </span>
                <span className="ml-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#FF2525]/20 text-[#FF2525]">
                  Role: {selectedAccount.role}
                </span>
                <span className="ml-2 text-[10px] font-mono px-2 py-0.5 rounded bg-[#FF762E]/15 text-[#FF762E]">
                  Code: {selectedAccount.referral_code}
                </span>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveUserReferralPerms}
                className="px-4 py-1.5 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Permissions for {selectedAccount.email}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {PERMISSION_LABELS.map((item) => (
                <label
                  key={item.key}
                  className="p-3 rounded-xl bg-[#141414] border border-[#454545] flex items-start gap-2.5 cursor-pointer hover:border-[#454545]"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(draftPerms[item.key])}
                    onChange={() =>
                      setDraftPerms({
                        ...draftPerms,
                        [item.key]: !draftPerms[item.key],
                      })
                    }
                    className="mt-0.5 w-4 h-4 accent-[#FF2525] rounded"
                  />
                  <div>
                    <span className="text-xs font-extrabold text-white block">{item.label}</span>
                    <span className="text-[10px] text-[#929292] leading-snug block mt-0.5">
                      {item.desc}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. OPTIONAL REFERRAL DISCOUNT MANAGEMENT (Part H) */}
      {discountDraft && (
        <form
          onSubmit={handleSaveDiscountConfig}
          className="p-4 sm:p-5 rounded-2xl bg-[#141414] border border-[#454545] space-y-4"
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#FF762E] flex items-center gap-1.5">
                <Tag className="w-4 h-4" />
                <span>3. Optional Referral Discount Controls (Percentage % OR Fixed Amount ₹)</span>
              </h3>
              <p className="text-[11px] text-[#929292] mt-0.5">
                 Referral Discount is completely optional. When OFF, the original plan price is charged. When ON, only the selected Discount Type (% OR ₹) is calculated on the backend—never both together, and final price is never negative.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                const nextEnabled = !discountDraft.discount_enabled;
                setDiscountDraft({
                  ...discountDraft,
                  discount_enabled: nextEnabled,
                  discount_type:
                    nextEnabled && discountDraft.discount_type === 'none'
                      ? 'percentage'
                      : discountDraft.discount_type,
                });
              }}
              className={`px-4 py-2 rounded-xl font-extrabold text-xs uppercase transition-all ${
                discountDraft.discount_enabled
                  ? 'bg-[#FF2525] text-slate-950 shadow-lg'
                  : 'bg-[#FF2525]/20 text-[#FF2525] border border-[#FF2525]/55'
              }`}
            >
              {discountDraft.discount_enabled ? 'Referral Discount: ON' : 'Referral Discount: OFF (Original Price Charged)'}
            </button>
          </div>

          {/* Mutually Exclusive Discount Type Selector */}
          <div className="p-3.5 rounded-2xl bg-[#090909] border border-[#454545] space-y-3">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#C5C5C5] block">
              Select Mutually Exclusive Discount Mode (Only ONE option applies when Discount is ON):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() =>
                  setDiscountDraft({
                    ...discountDraft,
                    discount_enabled: true,
                    discount_type: 'percentage',
                  })
                }
                className={`p-3 rounded-xl border text-left transition-all ${
                  discountDraft.discount_enabled && discountDraft.discount_type === 'percentage'
                    ? 'bg-[#FF762E]/15 border-[#FF762E]/50 text-white'
                    : 'bg-[#141414] border-[#454545] text-[#929292] hover:border-[#454545]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase text-[#FF762E]">
                    Option A: Percentage Discount (%)
                  </span>
                  {discountDraft.discount_enabled && discountDraft.discount_type === 'percentage' && (
                    <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-extrabold">
                      ACTIVE MODE
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#C5C5C5] mt-1">
                  Deducts a percentage (%) from the original plan price (capped at 0–100%).
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  setDiscountDraft({
                    ...discountDraft,
                    discount_enabled: true,
                    discount_type: 'fixed',
                  })
                }
                className={`p-3 rounded-xl border text-left transition-all ${
                  discountDraft.discount_enabled && discountDraft.discount_type === 'fixed'
                    ? 'bg-[#FF2525]/15 border-[#C5C5C5]/60 text-white'
                    : 'bg-[#141414] border-[#454545] text-[#929292] hover:border-[#454545]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase text-[#F5F5F5]">
                    Option B: Fixed Amount Discount (₹)
                  </span>
                  {discountDraft.discount_enabled && discountDraft.discount_type === 'fixed' && (
                    <span className="px-2 py-0.5 rounded bg-[#C5C5C5]/20 text-slate-950 text-[10px] font-extrabold">
                      ACTIVE MODE
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#C5C5C5] mt-1">
                  Deducts a flat Rupee (₹) amount from the original plan price (final price never goes below ₹0).
                </p>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[#C5C5C5] mb-1">
                {discountDraft.discount_type === 'fixed'
                  ? 'Fixed Amount to Deduct (₹)'
                  : 'Percentage Discount (%)'}
              </label>
              <input
                type="number"
                min="0"
                max={discountDraft.discount_type === 'percentage' ? 100 : undefined}
                step="any"
                value={discountDraft.discount_value}
                onChange={(e) =>
                  setDiscountDraft({
                    ...discountDraft,
                    discount_value: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-[#090909] border border-[#454545] text-xs text-white font-bold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#C5C5C5] mb-1">
                Minimum Plan Price (₹)
              </label>
              <input
                type="number"
                min="0"
                value={discountDraft.min_purchase_amount}
                onChange={(e) =>
                  setDiscountDraft({
                    ...discountDraft,
                    min_purchase_amount: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-[#090909] border border-[#454545] text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#C5C5C5] mb-1">
                Max Discount Cap (₹, 0 = No Cap)
              </label>
              <input
                type="number"
                min="0"
                value={discountDraft.max_discount_amount}
                onChange={(e) =>
                  setDiscountDraft({
                    ...discountDraft,
                    max_discount_amount: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-[#090909] border border-[#454545] text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#C5C5C5] mb-1">
                Usage Limit per Referred Student
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={discountDraft.usage_limit_per_user}
                onChange={(e) =>
                  setDiscountDraft({
                    ...discountDraft,
                    usage_limit_per_user: Math.max(1, Number(e.target.value) || 1),
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-[#090909] border border-[#454545] text-xs text-white"
              />
            </div>
          </div>

          {/* Live Backend Price Calculation Preview */}
          <div className="p-3 rounded-xl bg-[#090909] border border-[#454545] flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="text-[#C5C5C5]">
              <span className="font-bold text-[#FF762E]">Live Calculation Preview (Example ₹499 VIP Plan):</span>{' '}
              {isDiscountActive ? (
                <span>
                  Original Price: <strong>₹{samplePlanPrice}</strong> −{' '}
                  {discountDraft.discount_type === 'percentage'
                    ? `${discountDraft.discount_value}% Discount (₹${sampleDiscountAmount})`
                    : `Fixed ₹${discountDraft.discount_value} Discount (₹${sampleDiscountAmount})`}{' '}
                  = <strong className="text-[#F5F5F5]">Final Payable: ₹{sampleFinalPayable}</strong>
                </span>
              ) : (
                <span>
                  Referral Discount is <strong>OFF</strong> → Original Plan Price Charged:{' '}
                  <strong className="text-white">₹{samplePlanPrice}</strong>
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-[#FF762E] hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 shadow-lg"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Referral Discount Settings</span>
            </button>
          </div>
        </form>
      )}

      {/* 4. PER-REFERRER SALES & CONVERSION REPORTS (Part G) */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#141414] border border-[#454545] space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#F5F5F5] flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4" />
              <span>4. Separate Sales & Conversion Report for Each Referrer ({data.referrer_reports.length})</span>
            </h3>
            <p className="text-[11px] text-[#929292] mt-0.5">
              Only admin-approved (completed) VIP payments are counted in Verified VIP Sales. Pending and rejected payments are never counted as sales.
            </p>
          </div>
          {selectedReferrerFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedReferrerFilter('all')}
              className="px-3 py-1 rounded-lg bg-[#1D1D1D] text-[#FF762E] text-xs font-bold"
            >
              Clear Referrer Filter (Show All)
            </button>
          )}
        </div>

        {data.referrer_reports.length === 0 ? (
          <p className="text-xs text-[#929292]">No referrer activity recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#454545] text-[10px] uppercase tracking-wider text-[#929292]">
                  <th className="py-2.5 px-2">Referrer Account</th>
                  <th className="py-2.5 px-2">Code</th>
                  <th className="py-2.5 px-2 text-center">Total Referrals</th>
                  <th className="py-2.5 px-2 text-center">Registered</th>
                  <th className="py-2.5 px-2 text-center">Approved VIP Sales</th>
                  <th className="py-2.5 px-2 text-center">Non-Purchasing</th>
                  <th className="py-2.5 px-2 text-right">Gross Sales</th>
                  <th className="py-2.5 px-2 text-right">Discounts Given</th>
                  <th className="py-2.5 px-2 text-right">Net Collected</th>
                  <th className="py-2.5 px-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#454545]/70">
                {data.referrer_reports.map((rep) => (
                  <tr key={rep.referrer_user_id} className="hover:bg-[#141414]/40">
                    <td className="py-2.5 px-2">
                      <span className="font-bold text-white block">{rep.referrer_email}</span>
                      <span className="text-[10px] text-[#929292] font-mono">
                        ID: {rep.referrer_user_id} · {rep.referrer_account_type.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 font-mono text-[#FF762E] font-bold">{rep.referral_code}</td>
                    <td className="py-2.5 px-2 text-center font-bold text-white">{rep.total_referrals}</td>
                    <td className="py-2.5 px-2 text-center text-[#C5C5C5]">{rep.registered_referrals}</td>
                    <td className="py-2.5 px-2 text-center font-extrabold text-[#F5F5F5]">
                      {rep.vip_purchases_count}
                    </td>
                    <td className="py-2.5 px-2 text-center text-[#929292]">
                      {rep.non_purchasing_referrals_count}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-[#F5F5F5]">
                      ₹{rep.verified_gross_sales_inr}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-[#FF762E]">
                      -₹{rep.total_discounts_given_inr}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono font-extrabold text-[#F5F5F5]">
                      ₹{rep.verified_net_sales_inr}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedReferrerFilter(rep.referrer_user_id)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase ${
                          selectedReferrerFilter === rep.referrer_user_id
                            ? 'bg-[#FF762E] text-slate-950'
                            : 'bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5]'
                        }`}
                      >
                        {selectedReferrerFilter === rep.referrer_user_id ? 'Filtered' : 'Inspect Records'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. COMPLETE REFERRAL ATTRIBUTION & PAYMENT VERIFICATION LEDGER (Part G) */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#141414] border border-[#454545] space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#F5F5F5]">
              5. Complete Referral Attribution & VIP Purchase Ledger ({filteredReferrals.length})
            </h3>
            <p className="text-[11px] text-[#929292] mt-0.5">
              Clearly shows which user used which user&apos;s referral code, referred user&apos;s ID & email, referral code, registration date, and referral status.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={purchaseStatusFilter}
              onChange={(e) => setPurchaseStatusFilter(e.target.value as any)}
              className="px-3 py-1.5 rounded-xl bg-[#090909] border border-[#454545] text-xs text-white"
            >
              <option value="all">All Purchase Statuses</option>
              <option value="approved">Approved VIP Purchases</option>
              <option value="pending">Pending Verification</option>
              <option value="rejected">Rejected Payments</option>
              <option value="not_purchased">Registered (Not Purchased)</option>
            </select>

            <input
              type="text"
              placeholder="Search referrer, referred email, ID, code..."
              value={ledgerSearch}
              onChange={(e) => setLedgerSearch(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-[#090909] border border-[#454545] text-xs text-white min-w-[210px]"
            />
          </div>
        </div>

        {filteredReferrals.length === 0 ? (
          <p className="text-xs text-[#929292]">No referral records match the current filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#454545] text-[10px] uppercase tracking-wider text-[#929292]">
                  <th className="py-2 px-2">Record ID</th>
                  <th className="py-2 px-2">Code Owner (Referrer)</th>
                  <th className="py-2 px-2">Referred User (ID & Email)</th>
                  <th className="py-2 px-2">Referral Code Used</th>
                  <th className="py-2 px-2">Registration Date</th>
                  <th className="py-2 px-2">VIP Purchase Status</th>
                  <th className="py-2 px-2">Plan & Pricing</th>
                  <th className="py-2 px-2">Payment Req ID</th>
                  <th className="py-2 px-2">VIP Expiry</th>
                  <th className="py-2 px-2">Referral Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#454545]/70">
                {filteredReferrals.map((rec) => (
                  <tr key={rec.id} className="hover:bg-[#141414]/40">
                    <td className="py-2.5 px-2 font-mono text-[10px] text-[#929292]">{rec.id}</td>
                    <td className="py-2.5 px-2">
                      <span className="font-bold text-white block">{rec.referrer_email}</span>
                      <span className="text-[10px] text-[#929292] font-mono block">
                        Owner ID: {rec.referrer_user_id}
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="font-bold text-[#F5F5F5] block">{rec.referred_email}</span>
                      <span className="text-[10px] text-[#929292] font-mono block">
                        User ID: {rec.referred_user_id}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 font-mono text-[#FF762E] font-bold">{rec.referral_code}</td>
                    <td className="py-2.5 px-2 text-[11px] text-[#C5C5C5]">
                      {new Date(rec.registration_date || rec.created_at).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          rec.vip_purchase_status === 'approved'
                            ? 'bg-[#FF2525]/20 text-[#F5F5F5] border border-[#C5C5C5]/60'
                            : rec.vip_purchase_status === 'pending'
                            ? 'bg-[#FF762E]/20 text-[#FF762E] border border-[#FF762E]/50'
                            : rec.vip_purchase_status === 'rejected'
                            ? 'bg-[#FF2525]/20 text-[#FF2525] border border-[#FF2525]/55'
                            : 'bg-[#1D1D1D] text-[#929292]'
                        }`}
                      >
                        {rec.vip_purchase_status || 'not_purchased'}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-[11px]">
                      {rec.purchased_plan_title ? (
                        <div>
                          <span className="font-bold text-white block">{rec.purchased_plan_title}</span>
                          <span className="text-[10px] text-[#929292] font-mono">
                            Orig: ₹{rec.original_plan_price ?? 0} · Disc: -₹{rec.discount_applied ?? 0} · Paid: ₹{rec.final_amount_paid ?? 0}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[#929292]">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 font-mono text-[10px] text-[#FF2525]">
                      {rec.payment_request_id || '—'}
                    </td>
                    <td className="py-2.5 px-2 text-[10px] text-[#C5C5C5]">
                      {rec.membership_expiry_date
                        ? new Date(rec.membership_expiry_date).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="py-2.5 px-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          rec.status === 'rewarded'
                            ? 'bg-[#FF2525]/20 text-[#F5F5F5]'
                            : 'bg-[#FF2525]/20 text-[#FF2525]'
                        }`}
                      >
                        {rec.status} {rec.reward_days_granted > 0 ? `(+${rec.reward_days_granted}d)` : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

