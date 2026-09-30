import { PageHead } from "../components/PageHead";
import { Badge, SectionHead } from "../components/primitives";
import { AuditPanel } from "../components/AuditPanel";
import {
  BroadcastComposer,
  BroadcastStream,
  BroadcastStatusFlow,
  BroadcastRegionHint,
} from "../components/BroadcastConsole";

export function BroadcastPage() {
  return (
    <div>
      <PageHead
        kicker="EMERGENCY BROADCAST"
        title="Emergency Broadcast Console"
        sub="Compose, preview and publish public emergency instructions for affected regions. Broadcasts follow the draft to scheduled to active to expired lifecycle. This prototype does not transmit to any real channel and every publish is written to the audit trail."
        right={<Badge tone="red" dot>COMMAND ROLE</Badge>}
      />

      <section className="section">
        <div className="grid-2c">
          <BroadcastComposer region="" />
          <div className="console-stack">
            <BroadcastRegionHint />
            <BroadcastStatusFlow />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <BroadcastStream />
        </div>

        <SectionHead num="// AUDIT" title="Broadcast audit trail" />
        <AuditPanel />
      </section>
    </div>
  );
}