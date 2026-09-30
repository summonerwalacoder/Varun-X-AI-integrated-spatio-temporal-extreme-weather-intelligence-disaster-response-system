import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useSession, isAuthority, isCommand } from "../lib/session";
import { Panel, Badge, SectionHead } from "./primitives";
import { Icon } from "./Icon";

/**
 * Blocks authority-only routes from public/citizen sessions.
 *
 * This is a UI guard on top of a demo session. In a production build the same
 * constraint must be enforced server-side; the page copy states that clearly
 * and never grants capabilities by hiding a button.
 */
export function AuthorityGate({ children }: { children: ReactNode }) {
  const { session } = useSession();
  if (!isAuthority(session)) {
    return (
      <div>
        <SectionHead
          num="// ACCESS CONTROL"
          title="Authority access required"
          sub="This module is part of the authority operations layer and is not available to common user sessions."
        />
        <Panel title="ACCESS RESTRICTED">
          <div className="stack" style={{ gap: 14 }}>
            <div className="row-line">
              <span className="rl-l">
<Icon name="lock" size={18} aria-hidden />
                <span>
                  <div className="rl-t">AUTHORITY ACCESS REQUIRED</div>
                  <div className="rl-s">
                    Personnel, resources, emergency operations, and advanced model outputs are
                    limited to authorized disaster-management sessions.
                  </div>
                </span>
              </span>
              <Badge tone="amber">RESTRICTED</Badge>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              The prototype uses clearly labelled demo credentials. Production deployment enforces
              role-based access control on the backend, never only in the interface.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link className="btn btn-primary" to="/">
                <Icon name="lock" size={14} /> Authority Login
              </Link>
              <Link className="btn btn-outline" to="/citizen">
                Citizen Dashboard
              </Link>
            </div>
          </div>
        </Panel>
      </div>
    );
  }
  return <>{children}</>;
}

/** Requires the execute-capable command role for authority actions. */
export function CommandGate({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { session } = useSession();
  if (!isCommand(session)) {
    return fallback ?? null;
  }
  return <>{children}</>;
}