import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "../../utils/error";
import {
  addAgentRemoteHost,
  getAgentCustomHosts,
  getAgentRemoteHosts,
  listSshHosts,
  refreshAgentRemoteHosts,
  removeAgentRemoteHost,
  setAgentRemoteHosts,
  type CustomRemoteHost,
  type RemoteHostStatus,
} from "./api";

/** The status of a chosen host is re-read this often while the page is open. */
const STATUS_POLL_MS = 3_000;

/** One computer on the Remote computers page. */
export type RemoteHostEntry = {
  name: string;
  /** Added in the island; null for a Host from ~/.ssh/config. */
  custom: CustomRemoteHost | null;
  /** How reading it goes; null while it is off. */
  status: RemoteHostStatus | null;
};

/** What ssh is pointed at for an added computer, as the user would type it: `user@host:port`. */
export function customAddress(custom: CustomRemoteHost) {
  const user = custom.user ? `${custom.user}@` : "";
  const host = custom.host.includes(":") ? `[${custom.host}]` : custom.host;
  return `${user}${host}${custom.port ? `:${custom.port}` : ""}`;
}

/**
 * The computers the Remote computers page lists: the Hosts of ~/.ssh/config, then the ones added
 * in the island, then chosen ones found in neither (so they can still be switched off).
 */
export function useRemoteHosts() {
  const [available, setAvailable] = useState<string[] | null>(null);
  const [custom, setCustom] = useState<CustomRemoteHost[]>([]);
  const [statuses, setStatuses] = useState<RemoteHostStatus[]>([]);
  const [error, setError] = useState("");

  const refreshStatuses = useCallback(() => {
    getAgentRemoteHosts()
      .then((next) => setStatuses(Array.isArray(next) ? next : []))
      .catch((reason: unknown) => console.error("Failed to read remote hosts", reason));
  }, []);

  useEffect(() => {
    listSshHosts()
      .then((next) => setAvailable(Array.isArray(next) ? next : []))
      .catch((reason: unknown) => {
        setAvailable([]);
        setError(getErrorMessage(reason));
      });
    getAgentCustomHosts()
      .then((next) => setCustom(Array.isArray(next) ? next : []))
      .catch((reason: unknown) => console.error("Failed to read added remote hosts", reason));
    refreshStatuses();
    const timer = window.setInterval(refreshStatuses, STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refreshStatuses]);

  const chosen = statuses.map((status) => status.host);
  const names = [...(available ?? []), ...custom.map((host) => host.name), ...chosen];
  const entries: RemoteHostEntry[] = [...new Set(names)].map((name) => ({
    name,
    custom: custom.find((host) => host.name === name) ?? null,
    status: statuses.find((status) => status.host === name) ?? null,
  }));

  const run = <T,>(action: Promise<T>, then: (value: T) => void) =>
    action
      .then((value) => {
        setError("");
        then(value);
        refreshStatuses();
        return true;
      })
      .catch((reason: unknown) => {
        setError(getErrorMessage(reason));
        return false;
      });

  return {
    loaded: available !== null,
    entries,
    error,
    toggle: (name: string, on: boolean) =>
      void run(setAgentRemoteHosts(on ? [...chosen, name] : chosen.filter((known) => known !== name)), () => undefined),
    add: (host: CustomRemoteHost) => run(addAgentRemoteHost(host), setCustom),
    remove: (name: string) => void run(removeAgentRemoteHost(name), setCustom),
    refresh: () => void run(refreshAgentRemoteHosts(), () => undefined),
  };
}
