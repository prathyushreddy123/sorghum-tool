import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useTeam } from '../contexts/TeamContext';
import ConfirmDialog from '../components/ConfirmDialog';
import TrialSharingManager from '../components/TrialSharingManager';

export default function TeamManagement() {
  const { user } = useAuth();
  const { teams, activeTeam, setActiveTeam, refreshTeams } = useTeam();

  const [showCreate, setShowCreate] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState<number | null>(null);
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [removingMember, setRemovingMember] = useState<{ teamId: number; userId: number; name: string } | null>(null);

  async function handleCreate() {
    if (!teamName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const team = await api.createTeam({ name: teamName.trim() });
      setTeamName('');
      setShowCreate(false);
      setSuccess(`Team "${team.name}" created!`);
      setTimeout(() => setSuccess(''), 3000);
      await refreshTeams();
      setActiveTeam(team);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create team');
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin() {
    if (!inviteCode.trim()) return;
    setJoining(true);
    setError('');
    try {
      const team = await api.joinTeam(inviteCode.trim());
      setInviteCode('');
      setSuccess(`Joined "${team.name}"!`);
      setTimeout(() => setSuccess(''), 3000);
      await refreshTeams();
      setActiveTeam(team);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid invite code');
    } finally {
      setJoining(false);
    }
  }

  async function handleLeave() {
    if (leaving === null) return;
    setActionLoading(true);
    try {
      await api.leaveTeam(leaving);
      if (activeTeam?.id === leaving) setActiveTeam(null);
      await refreshTeams();
      setLeaving(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to leave team');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    if (deleting === null) return;
    setActionLoading(true);
    try {
      await api.deleteTeam(deleting);
      if (activeTeam?.id === deleting) setActiveTeam(null);
      await refreshTeams();
      setDeleting(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete team');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRemoveMember() {
    if (!removingMember) return;
    setActionLoading(true);
    try {
      await api.removeTeamMember(removingMember.teamId, removingMember.userId);
      await refreshTeams();
      setRemovingMember(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove member');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRegenerateCode(teamId: number) {
    try {
      await api.regenerateInviteCode(teamId);
      await refreshTeams();
      setSuccess('Invite code regenerated');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to regenerate code');
    }
  }

  function copyCode(code: string, teamId: number) {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(teamId);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="max-w-3xl mx-auto pb-6">
      <div className="px-5 sm:px-6 pt-2 pb-4">
        <h1 className="text-2xl font-bold text-neutral">Teams</h1>
        <p className="text-sm text-gray-400 mt-1">
          Collaborate with your group — share and sync trials together.
        </p>
      </div>

      {error && (
        <div className="mx-5 sm:mx-6 mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          {error}
          <button onClick={() => setError('')} className="ml-2 font-semibold">Dismiss</button>
        </div>
      )}

      {success && (
        <div className="mx-5 sm:mx-6 mb-4 p-3 bg-green-50 border border-green-100 rounded-xl text-sm text-primary">
          {success}
        </div>
      )}

      <div className="px-5 sm:px-6">
        {/* Active team indicator */}
        <div className="bg-card rounded-2xl border border-gray-100 p-4 mb-5 shadow-sm">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Active Workspace</div>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              activeTeam ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'
            }`}>
              {activeTeam ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-neutral">
                {activeTeam ? activeTeam.name : 'Personal'}
              </div>
              <div className="text-xs text-gray-400">
                {activeTeam
                  ? `${activeTeam.member_count} member${activeTeam.member_count !== 1 ? 's' : ''}`
                  : 'Only your own trials'}
              </div>
            </div>
            {activeTeam && (
              <button
                onClick={() => setActiveTeam(null)}
                className="text-xs font-medium text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Switch to Personal
              </button>
            )}
          </div>
        </div>

        {/* Join a team */}
        <div className="bg-card rounded-2xl border border-gray-100 p-4 mb-5 shadow-sm">
          <h3 className="text-sm font-semibold text-neutral mb-3">Join a Team</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="Enter invite code (e.g. ABCD-1234)"
              className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-background text-neutral placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <button
              onClick={handleJoin}
              disabled={!inviteCode.trim() || joining}
              className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-primary-dark transition-colors min-h-[44px]"
            >
              {joining ? 'Joining...' : 'Join'}
            </button>
          </div>
        </div>

        {/* Create a team */}
        {!showCreate ? (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full mb-5 p-4 bg-card rounded-2xl border-2 border-dashed border-gray-200 hover:border-primary/40 hover:bg-primary/3 transition-all text-center group"
          >
            <div className="flex items-center justify-center gap-2 text-gray-400 group-hover:text-primary transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span className="font-semibold text-sm">Create New Team</span>
            </div>
          </button>
        ) : (
          <div className="bg-card rounded-2xl border border-gray-100 p-4 mb-5 shadow-sm">
            <h3 className="text-sm font-semibold text-neutral mb-3">Create New Team</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Team name (e.g. Sorghum Lab 2026)"
                className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-background text-neutral placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
              <button
                onClick={handleCreate}
                disabled={!teamName.trim() || creating}
                className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-primary-dark transition-colors min-h-[44px]"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => { setShowCreate(false); setTeamName(''); }}
                className="px-3 py-2.5 text-gray-400 hover:text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Team list */}
        {teams.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Your Teams</h2>
              <span className="text-xs text-gray-400">{teams.length} team{teams.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="space-y-3">
              {teams.map((team) => {
                const isActive = activeTeam?.id === team.id;
                const isExpanded = expandedTeam === team.id;
                const isCreator = user?.id === team.created_by;

                return (
                  <div
                    key={team.id}
                    className={`bg-card rounded-2xl border overflow-hidden transition-all shadow-sm ${
                      isActive ? 'border-primary/30 ring-1 ring-primary/10' : 'border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    {/* Team header */}
                    <div className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          isActive ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'
                        }`}>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-neutral truncate">{team.name}</span>
                            {isActive && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                                Active
                              </span>
                            )}
                            {isCreator && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600">
                                Creator
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {team.member_count} member{team.member_count !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {!isActive && (
                            <button
                              onClick={() => setActiveTeam(team)}
                              className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary-dark transition-colors min-h-[32px]"
                            >
                              Activate
                            </button>
                          )}
                          <button
                            onClick={() => setExpandedTeam(isExpanded ? null : team.id)}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                              isExpanded ? 'bg-gray-100 text-gray-600' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-50'
                            }`}
                          >
                            <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 p-4 bg-gray-50/50">
                        {/* Invite code */}
                        <div className="mb-4">
                          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Invite Code</div>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 text-sm font-mono bg-white px-3 py-2 rounded-lg border border-gray-200 text-neutral tracking-wider">
                              {team.invite_code}
                            </code>
                            <button
                              onClick={() => copyCode(team.invite_code, team.id)}
                              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[36px]"
                            >
                              {copied === team.id ? 'Copied!' : 'Copy'}
                            </button>
                            <button
                              onClick={() => handleRegenerateCode(team.id)}
                              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors min-h-[36px]"
                              title="Generate new invite code"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                              </svg>
                            </button>
                          </div>
                          <p className="text-[11px] text-gray-400 mt-1.5">
                            Share this code with people you want to invite to this team.
                          </p>
                        </div>

                        {/* Members */}
                        <div className="mb-4">
                          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Members</div>
                          <div className="space-y-1.5">
                            {team.members.map((member) => (
                              <div key={member.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                                    {member.user_name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-neutral truncate">
                                      {member.user_name}
                                      {member.user_id === user?.id && (
                                        <span className="text-gray-400 font-normal"> (you)</span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-gray-400 truncate">{member.user_email}</div>
                                  </div>
                                </div>
                                {member.user_id !== user?.id && (
                                  <button
                                    onClick={() => setRemovingMember({
                                      teamId: team.id,
                                      userId: member.user_id,
                                      name: member.user_name,
                                    })}
                                    className="text-gray-300 hover:text-error text-xs font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors flex-shrink-0"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Trial Sharing */}
                        <div className="mb-4">
                          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Shared Trials</div>
                          <div className="bg-white rounded-lg border border-gray-100 p-3">
                            <TrialSharingManager teamId={team.id} />
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                          <button
                            onClick={() => setLeaving(team.id)}
                            className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-error hover:bg-red-50 rounded-lg transition-colors min-h-[36px]"
                          >
                            Leave Team
                          </button>
                          {isCreator && (
                            <button
                              onClick={() => setDeleting(team.id)}
                              className="px-3 py-1.5 text-sm font-medium text-error hover:bg-red-50 rounded-lg transition-colors min-h-[36px]"
                            >
                              Delete Team
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {teams.length === 0 && (
          <div className="text-center py-10">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-neutral mb-1">No teams yet</h3>
            <p className="text-sm text-gray-400 max-w-[280px] mx-auto">
              Create a team to start collaborating, or join an existing one with an invite code.
            </p>
          </div>
        )}

        <div className="h-24" />
      </div>

      <ConfirmDialog
        open={leaving !== null}
        title="Leave Team"
        message="You'll no longer see this team's trials. You can rejoin later with an invite code."
        onConfirm={handleLeave}
        onCancel={() => setLeaving(null)}
        loading={actionLoading}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete Team"
        message="This will permanently delete this team. All trials will be unlinked from the team but not deleted. This cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        loading={actionLoading}
      />

      <ConfirmDialog
        open={removingMember !== null}
        title="Remove Member"
        message={`Remove ${removingMember?.name} from this team? They can rejoin with an invite code.`}
        onConfirm={handleRemoveMember}
        onCancel={() => setRemovingMember(null)}
        loading={actionLoading}
      />
    </div>
  );
}
