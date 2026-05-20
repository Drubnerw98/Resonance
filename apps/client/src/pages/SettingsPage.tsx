import { PageHeader } from "../components/shared/PageHeader.tsx";
import { McpTokensSection } from "../components/settings/McpTokensSection.tsx";
import { DangerZone } from "../components/settings/DangerZone.tsx";

/**
 * Account + integration surface. Holds the concerns that accreted onto
 * /profile but never belonged to the "taste DNA" identity page: MCP access
 * tokens and the destructive profile-reset. Neither needs the taste profile
 * loaded, so this page has no loading/missing states of its own.
 */
export function SettingsPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        subtitle="Connect external MCP clients and manage your account."
      />
      <McpTokensSection />
      <DangerZone />
    </div>
  );
}
