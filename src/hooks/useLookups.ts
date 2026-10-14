import { useMemo } from 'react';
import type { Client, Member } from '../../shared/types';
import { useData } from '../store/data';
import { usePrefs } from '../store/ui';

export function useMembersById() {
  const members = useData((s) => s.members);
  return useMemo(() => new Map<string, Member>(members.map((m) => [m.id, m])), [members]);
}

export function useClientsById() {
  const clients = useData((s) => s.clients);
  return useMemo(() => new Map<string, Client>(clients.map((c) => [c.id, c])), [clients]);
}

/** The member chosen in Settings as "who am I" — only if it still exists. */
export function useCurrentUser(): Member | null {
  const id = usePrefs((s) => s.currentUserId);
  const members = useData((s) => s.members);
  return useMemo(() => members.find((m) => m.id === id) ?? null, [members, id]);
}
