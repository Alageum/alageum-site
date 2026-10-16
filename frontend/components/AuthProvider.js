"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { me } from "@/lib/api/auth";
import { getSession } from "@/lib/api/client";
import { getSessionGeneration, subscribeSession } from "@/lib/api/sessionTransport";
import { organizationProfileScope } from "@/lib/organizations/profile";

import { isPublicOnly } from '@/lib/deployment/publicMode';

const AuthContext = createContext({ profile: null, loading: true, hasPermission: () => false });

export function AuthProvider({ children }) {
  const [state, updateState] = useState(null);
  const profileGeneration = useRef(0);
  const profileReadGeneration = useRef(0);
  const currentProfile = useRef(null);
  const installedGeneration = useRef(null);
  const organizationChanges = useRef(new Set());
  const sessionGeneration = useSyncExternalStore(subscribeSession, getSessionGeneration, () => 0);
  const loading = !state || state.sessionGeneration !== sessionGeneration;
  const profile = loading ? null : state.profile;
  const authError = loading ? null : state.authError;
  const setProfile = useCallback((next) => {
    const generation = ++profileGeneration.current;
    profileReadGeneration.current += 1;
    currentProfile.current = next;
    installedGeneration.current = getSessionGeneration();
    updateState({ profile: next, authError: null, generation, sessionGeneration: installedGeneration.current });
  }, []);
  useEffect(() => {
    const expired = () => setProfile(null);
    window.addEventListener("alageum:session-expired", expired);
    // A validated login/selection can install the profile in the same render as
    // its session boundary. Do not start a competing /me read over that result.
    if (installedGeneration.current === sessionGeneration) {
      return () => window.removeEventListener("alageum:session-expired", expired);
    }
    const generation = ++profileGeneration.current;
    const readGeneration = ++profileReadGeneration.current;
    const controller = new AbortController();
    let active = true;
    const current = () => active && profileGeneration.current === generation && profileReadGeneration.current === readGeneration && getSessionGeneration() === sessionGeneration;
    const loadProfile = async () => !isPublicOnly() && getSession().access_token && !getSession().federated_pending ? me(controller.signal) : null;
    const install = (value, error = null) => {
      if (current()) {
        currentProfile.current = value;
        installedGeneration.current = sessionGeneration;
        updateState({ profile: value, authError: error, generation, sessionGeneration });
      }
    };
    loadProfile().then(value => install(value)).catch(error => install(null, error));
    return () => { active = false; controller.abort(); window.removeEventListener("alageum:session-expired", expired); };
  }, [setProfile, sessionGeneration]);
  const isAuthScopeCurrent = useCallback(scope => Boolean(scope &&
    scope === organizationProfileScope(currentProfile.current, profileGeneration.current, getSessionGeneration()) &&
    getSession().access_token && (!getSession().organization_id || getSession().organization_id === currentProfile.current?.organization?.id)), []);
  const updateOrganization = useCallback((snapshot, scope) => {
    if (!isAuthScopeCurrent(scope) || snapshot.organization_id !== currentProfile.current?.organization?.id) return;
    profileReadGeneration.current += 1;
    const next = { ...currentProfile.current, organization: { ...currentProfile.current.organization, name: snapshot.name } };
    currentProfile.current = next;
    updateState(previous => isAuthScopeCurrent(scope) ? { ...previous, profile: next } : previous);
  }, [isAuthScopeCurrent]);
  const registerOrganizationChange = useCallback(reader => {
    organizationChanges.current.add(reader);
    return () => organizationChanges.current.delete(reader);
  }, []);
  const getOrganizationChangeState = useCallback(() => {
    const result = { dirty: false, pending: false };
    for (const reader of organizationChanges.current) {
      const value = reader();
      result.dirty ||= Boolean(value?.dirty);
      result.pending ||= Boolean(value?.pending);
    }
    return result;
  }, []);
  const value = useMemo(() => ({
    profile,
    loading,
    authError,
    setProfile,
    authScope: organizationProfileScope(profile, state?.generation, sessionGeneration),
    isAuthScopeCurrent,
    updateOrganization,
    registerOrganizationChange,
    getOrganizationChangeState,
    hasPermission: (code) => profile?.permissions?.includes(code) || false,
  }), [profile, loading, authError, setProfile, state?.generation, sessionGeneration, isAuthScopeCurrent, updateOrganization, registerOrganizationChange, getOrganizationChangeState]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
