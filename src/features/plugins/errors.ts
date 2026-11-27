const PLUGIN_FAILURES = [
  "plugin_index_unavailable", "plugin_index_incompatible", "plugin_not_listed",
  "plugin_package_download_failed", "plugin_package_integrity_failed", "plugin_package_invalid", "plugin_install_failed", "plugin_start_failed",
  "plugin_download_timeout", "plugin_download_interrupted", "plugin_download_http_client", "plugin_download_http_server",
  "plugin_disk_full", "plugin_install_in_progress", "plugin_uninstall_failed", "plugin_install_cancelled",
] as const;

export type PluginFailure = (typeof PLUGIN_FAILURES)[number];

export function pluginFailureCode(error: unknown): PluginFailure | undefined {
  const code = error instanceof Error ? error.message : error;
  return PLUGIN_FAILURES.find((value) => value === code);
}
