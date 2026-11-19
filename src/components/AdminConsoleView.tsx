import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Check, ClipboardList, Flag, Shield, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AdminOverview } from '../types/campus';

interface AdminConsoleViewProps {
  onToast: (msg: string) => void;
}

type AdminTab = 'verifications' | 'reports' | 'members' | 'colleges' | 'audit';

export const AdminConsoleView: React.FC<AdminConsoleViewProps> = ({ onToast }) => {
  const { profile, loading: authLoading, apiFetch } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isModerator = profile?.role === 'moderator';
  const isStaff = isAdmin || isModerator;

  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<AdminTab>('reports');
  const [collegeName, setCollegeName] = useState('');
  const [collegeLocation, setCollegeLocation] = useState('');
  const [collegeDomains, setCollegeDomains] = useState('');
  const [verifyCollegeByUser, setVerifyCollegeByUser] = useState<Record<number, number>>({});

  // Clear cached console data and clamp tab immediately on role changes
  useEffect(() => {
    setData(null);
    if (!isAdmin) {
      setTab('reports');
    } else {
      setTab((prev) => (prev === 'reports' ? 'verifications' : prev));
    }
  }, [profile?.id, profile?.role, isAdmin]);

  const loadOverview = useCallback(async () => {
    if (authLoading || !isStaff) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/overview');
      if (res.ok) {
        const overview = await res.json();
        setData(overview);
      } else {
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, [apiFetch, authLoading, isStaff]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  if (authLoading) {
    return (
      <div className="h-56 rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] animate-pulse" />
    );
  }

  if (!isStaff) {
    return (
      <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-8 text-center">
        <p className="text-sm font-semibold text-[#17152B] dark:text-[#F1F2F9]">
          Moderator or Administrator permissions required.
        </p>
      </div>
    );
  }

  const activeTab: AdminTab = isAdmin ? tab : 'reports';
  const activeColleges = (data?.colleges || []).filter((c) => c.status === 'active');

  const handleDecideVerification = async (id: number, decision: 'approved' | 'rejected') => {
    if (!isAdmin) return;
    const res = await apiFetch(`/api/admin/verifications/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify({
        decision,
        reviewNotes: decision === 'approved' ? 'Verified by campus admin' : 'Insufficient campus evidence',
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (res.ok) {
      onToast(`Verification request ${decision}.`);
      loadOverview();
    } else {
      onToast(payload.error || 'Could not update verification request.');
      if (res.status === 409) {
        loadOverview();
      }
    }
  };

  const handleDecideReport = async (
    id: number,
    status: 'reviewing' | 'resolved' | 'dismissed',
    hideTarget: boolean
  ) => {
    const res = await apiFetch(`/api/admin/reports/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify({
        status,
        hideTarget,
        resolutionNotes: hideTarget ? 'Content hidden per community guidelines' : `Marked ${status}`,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (res.ok) {
      onToast(`Report marked ${status}.`);
      loadOverview();
    } else {
      onToast(payload.error || 'Could not update report.');
    }
  };

  const handleUpdateMember = async (
    userId: number,
    updates: {
      role?: string;
      isRestricted?: boolean;
      verificationStatus?: string;
      collegeId?: number | null;
    }
  ) => {
    if (!isAdmin) return;
    const res = await apiFetch(`/api/admin/users/${userId}/role`, {
      method: 'POST',
      body: JSON.stringify(updates),
    });
    const payload = await res.json().catch(() => ({}));
    if (res.ok) {
      onToast('Member record updated and logged.');
      loadOverview();
    } else {
      onToast(payload.error || 'Could not update member record.');
    }
  };

  const handleCreateCollege = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const res = await apiFetch('/api/admin/colleges', {
      method: 'POST',
      body: JSON.stringify({
        name: collegeName,
        location: collegeLocation,
        approvedDomains: collegeDomains,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (res.ok) {
      setCollegeName('');
      setCollegeLocation('');
      setCollegeDomains('');
      onToast('College record added.');
      loadOverview();
    } else {
      onToast(payload.error || 'Could not add college.');
    }
  };

  const pendingVerifications = isAdmin
    ? data?.verifications.filter((v) => v.status === 'pending').length ?? 0
    : 0;
  const openReports =
    data?.reports.filter((r) => r.status === 'open' || r.status === 'reviewing').length ?? 0;

  const visibleTabs: Array<{ id: AdminTab; label: string; icon: typeof Flag }> = isAdmin
    ? [
        { id: 'verifications', label: 'Verifications', icon: Shield },
        { id: 'reports', label: 'Reports Queue', icon: Flag },
        { id: 'members', label: 'Members & Roles', icon: Users },
        { id: 'colleges', label: 'Colleges', icon: Building2 },
        { id: 'audit', label: 'Audit Log', icon: ClipboardList },
      ]
    : [{ id: 'reports', label: 'Reports Queue', icon: Flag }];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#17152B] dark:text-[#F1F2F9]">
              {isAdmin ? 'Admin & Safety Console' : 'Moderation Safety Queue'}
            </h1>
            <p className="mt-1 text-xs text-[#6A6784] dark:text-[#9CA0B8]">
              {isAdmin
                ? 'Review campus verifications, moderation reports, member roles, and auditable actions.'
                : 'Review and resolve flagged community reports.'}
            </p>
          </div>
          <div className="text-xs text-[#6A6784] dark:text-[#9CA0B8] tabular-nums">
            {isAdmin ? `${pendingVerifications} pending verifications · ` : ''}
            {openReports} open reports
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {visibleTabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  activeTab === item.id
                    ? 'bg-[#5B4BFF] text-white'
                    : 'bg-[#F5F5FA] dark:bg-[#0E101A] text-[#6A6784] dark:text-[#9CA0B8]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading || !data ? (
        <div className="h-56 rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] animate-pulse" />
      ) : (
        <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-5 overflow-x-auto">
          {isAdmin && activeTab === 'verifications' && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-[#17152B] dark:text-[#F1F2F9]">
                Student &amp; Faculty Verification Requests
              </h2>
              {data.verifications.length === 0 ? (
                <p className="text-xs text-[#6A6784]">No verification requests recorded.</p>
              ) : (
                <div className="divide-y divide-[#E3E1EE] dark:divide-[#23273A]">
                  {data.verifications.map((v) => (
                    <div
                      key={v.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-[#17152B] dark:text-[#F1F2F9]">
                          {v.user?.displayName || `User #${v.userId}`}
                          <span className="ml-2 text-xs font-semibold text-[#5B4BFF] capitalize">
                            {v.requestedRole} · {v.status}
                          </span>
                        </p>
                        <p className="text-xs text-[#6A6784] dark:text-[#9CA0B8]">
                          {v.collegeEmail || v.user?.email} · Method: {v.method}
                        </p>
                        <p className="text-xs text-[#3F3C56] dark:text-[#C5C7D9]">
                          {v.evidenceNote}
                        </p>
                      </div>

                      {v.status === 'pending' && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDecideVerification(v.id, 'approved')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#13866B] text-white text-xs font-semibold"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDecideVerification(v.id, 'rejected')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#E3E1EE] dark:border-[#23273A] text-xs font-semibold text-red-600"
                          >
                            <X className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-[#17152B] dark:text-[#F1F2F9]">
                Moderation Reports Queue
              </h2>
              {data.reports.length === 0 ? (
                <p className="text-xs text-[#6A6784]">No reports in the queue.</p>
              ) : (
                <div className="divide-y divide-[#E3E1EE] dark:divide-[#23273A]">
                  {data.reports.map((r) => (
                    <div
                      key={r.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-[#17152B] dark:text-[#F1F2F9]">
                          {r.reason}
                        </p>
                        <p className="text-xs text-[#6A6784] dark:text-[#9CA0B8] tabular-nums">
                          Target: {r.targetType} #{r.targetId} · Priority: {r.priority} · Status:{' '}
                          <span className="font-semibold text-[#5B4BFF]">{r.status}</span>
                        </p>
                        {r.details && (
                          <p className="text-xs text-[#3F3C56] dark:text-[#C5C7D9]">{r.details}</p>
                        )}
                      </div>

                      {(r.status === 'open' || r.status === 'reviewing') && (
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDecideReport(r.id, 'resolved', true)}
                            className="px-3 py-1.5 rounded-lg bg-[#DD2A7B] text-white text-xs font-semibold"
                          >
                            Hide Target &amp; Resolve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDecideReport(r.id, 'dismissed', false)}
                            className="px-3 py-1.5 rounded-lg border border-[#E3E1EE] dark:border-[#23273A] text-xs font-semibold text-[#6A6784]"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isAdmin && activeTab === 'members' && (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E3E1EE] dark:border-[#23273A] text-[#6A6784] dark:text-[#9CA0B8]">
                  <th className="py-2 pr-3">Member</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Verification</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E1EE] dark:divide-[#23273A]">
                {data.members.map((m) => {
                  const chosenCollegeId =
                    verifyCollegeByUser[m.id] ??
                    (m.collegeId && activeColleges.some((c) => c.id === m.collegeId)
                      ? m.collegeId
                      : activeColleges[0]?.id ?? 0);

                  return (
                    <tr key={m.id}>
                      <td className="py-2.5 pr-3">
                        <p className="font-bold text-[#17152B] dark:text-[#F1F2F9]">
                          {m.displayName}
                        </p>
                        <p className="text-[#6A6784]">{m.email}</p>
                      </td>
                      <td className="py-2.5 pr-3">
                        <select
                          disabled={m.id === profile?.id}
                          value={m.role}
                          onChange={(e) => handleUpdateMember(m.id, { role: e.target.value })}
                          className="rounded-lg border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-2 py-1 text-xs disabled:opacity-50"
                        >
                          <option value="student">Student</option>
                          <option value="faculty">Faculty</option>
                          <option value="alumni">Alumni</option>
                          <option value="moderator">Moderator</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="py-2.5 pr-3 capitalize">
                        {m.verificationStatus}
                        {m.isRestricted ? ' · Restricted' : ''}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-2">
                          {m.verificationStatus !== 'verified' && (
                            <>
                              <select
                                aria-label={`Assign college for ${m.displayName}`}
                                value={chosenCollegeId}
                                onChange={(e) =>
                                  setVerifyCollegeByUser((prev) => ({
                                    ...prev,
                                    [m.id]: Number(e.target.value),
                                  }))
                                }
                                className="rounded-lg border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-2 py-1 text-xs max-w-[170px]"
                              >
                                {activeColleges.length === 0 && (
                                  <option value={0}>No active colleges</option>
                                )}
                                {activeColleges.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={!chosenCollegeId}
                                onClick={() =>
                                  handleUpdateMember(m.id, {
                                    verificationStatus: 'verified',
                                    collegeId: chosenCollegeId,
                                  })
                                }
                                className="text-xs font-semibold text-[#13866B] hover:underline disabled:opacity-50"
                              >
                                Verify
                              </button>
                            </>
                          )}
                          {m.id !== profile?.id && (
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateMember(m.id, { isRestricted: !m.isRestricted })
                              }
                              className="text-xs font-semibold text-red-600 hover:underline"
                            >
                              {m.isRestricted ? 'Restore' : 'Restrict'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {isAdmin && activeTab === 'colleges' && (
            <div className="space-y-5">
              <div className="divide-y divide-[#E3E1EE] dark:divide-[#23273A]">
                {data.colleges.map((c) => (
                  <div key={c.id} className="py-3 first:pt-0">
                    <p className="text-sm font-bold text-[#17152B] dark:text-[#F1F2F9]">
                      {c.name}
                    </p>
                    <p className="text-xs text-[#6A6784] dark:text-[#9CA0B8]">
                      {c.location} · Approved domains:{' '}
                      <span className="font-mono">{c.approvedDomains.join(', ')}</span>
                    </p>
                  </div>
                ))}
              </div>

              <form
                onSubmit={handleCreateCollege}
                className="pt-4 border-t border-[#E3E1EE] dark:border-[#23273A] grid grid-cols-1 sm:grid-cols-3 gap-2"
              >
                <input
                  type="text"
                  required
                  value={collegeName}
                  onChange={(e) => setCollegeName(e.target.value)}
                  placeholder="New college name"
                  className="rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={collegeLocation}
                  onChange={(e) => setCollegeLocation(e.target.value)}
                  placeholder="City / Location"
                  className="rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-xs"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={collegeDomains}
                    onChange={(e) => setCollegeDomains(e.target.value)}
                    placeholder="institutional domains (e.g. mit.edu)"
                    className="flex-1 rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-xs"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 rounded-xl bg-[#5B4BFF] text-white text-xs font-semibold whitespace-nowrap"
                  >
                    Add
                  </button>
                </div>
              </form>
            </div>
          )}

          {isAdmin && activeTab === 'audit' && (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E3E1EE] dark:border-[#23273A] text-[#6A6784]">
                  <th className="py-2 pr-3">Timestamp</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Target</th>
                  <th className="py-2">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E3E1EE] dark:divide-[#23273A]">
                {data.auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2 pr-3 font-mono tabular-nums text-[#6A6784]">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 font-semibold text-[#17152B] dark:text-[#F1F2F9]">
                      {log.action}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {log.targetType} #{log.targetId ?? '-'}
                    </td>
                    <td className="py-2 text-[#6A6784] dark:text-[#9CA0B8]">{log.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
