export interface AnalyticsEvent {
  name: string;
  path?: string;
}

/** Fila local. Sem consentimento, o evento não entra. */
export function enqueueEvent(queue: AnalyticsEvent[], event: AnalyticsEvent, consent: boolean, limit = 50): AnalyticsEvent[] {
  if (!consent) return queue;
  if (!event.name.trim()) return queue;
  return [...queue, { name: event.name.trim(), path: event.path }].slice(-limit);
}

export function accountExport<T extends { password?: string }>(user: T): Omit<T, "password"> & { password: "omitido" } {
  const { password: _password, ...rest } = user;
  return { ...rest, password: "omitido" };
}
