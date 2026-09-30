import { useEffect, useState } from "react";
import { PageHead } from "../components/PageHead";
import { Panel, Badge, SectionHead, Metric, RiskBadge, DataState } from "../components/primitives";
import { MapBox, EventSelect } from "../components/MapBox";
import { RiskEvolutionChart } from "../components/Charts";
import { Icon } from "../components/Icon";
import { useConsoleAnalysis } from "../lib/console";
import type { AnalysisEvent, DetailedTrackPoint, FieldKind } from "../lib/analysis";

const LAYERS: FieldKind[] = ["risk", "precip", "efi"];

function lead(hours: number): string {
  if (hours > 0) return `T+${hours}h`;
  if (hours === 0) return "NOW";
  return `T${hours}h`;
}

export function TrackingPage() {
  const c = useConsoleAnalysis();
  const [kind, setKind] = useState<FieldKind>("risk");
  const [playing, setPlaying] = useState(false);

  const len = c.event?.track.length ?? 0;

  useEffect(() => {
    if (!playing || !len) return;
    const t = window.setInterval(() => {
      const at = c.timeIdx < 0 ? len - 1 : c.timeIdx;
      if (at >= len - 1) {
        setPlaying(false);
        return;
      }
      c.setTimeIdx(at + 1);
    }, 900);
    return () => window.clearInterval(t);
  }, [playing, len, c.timeIdx]);

  if (c.status === "loading" || c.status === "idle") {
    return (
      <div>
        <PageHead kicker="SPATIO-TEMPORAL TRACKING" title="Extreme Event Tracking" />
        <section className="section">
          <Panel title="TRACKING" meta="VARUN-X SERVER">
            <DataState
              icon="alert"
              title={c.regionPending ? "SELECT A REGION" : "LOADING ANALYSIS"}
              desc={
                c.regionPending
                  ? "Tracking needs a region. Allow location access or pick a location on the Live Weather page."
                  : (c.error ?? "Requesting detected objects for the selected region.")
              }
              action={<button className="btn" onClick={() => void c.reload()}>RETRY</button>}
            />
          </Panel>
        </section>
      </div>
    );
  }

  if (c.status === "unavailable" || !c.analysis) {
    return (
      <div>
        <PageHead kicker="SPATIO-TEMPORAL TRACKING" title="Extreme Event Tracking" />
        <section className="section">
          <Panel title="TRACKING" meta="VARUN-X SERVER">
            <DataState
              icon="alert"
              title="TRACKING DATA UNAVAILABLE"
              desc={c.error ?? "The server did not return an analysis. No local replay is substituted."}
              action={
                <button className="btn btn-primary" onClick={() => void c.reload()}>
                  Retry
                </button>
              }
            />
          </Panel>
        </section>
      </div>
    );
  }

  const event = c.event;
  const field = c.field(kind);

  if (!event) {
    return (
      <div>
        <PageHead
          kicker="SPATIO-TEMPORAL TRACKING"
          title="Extreme Event Tracking"
          sub="Objects are followed across space and time only in the frames where the server detected them."
        />
        <section className="section">
          <Panel title="TRACKING" meta="NO OBJECT DETECTED">
            <DataState
              icon="shield"
              title="NO OBJECT DETECTED"
              desc="The server scanned the analysis window and did not detect an extreme object. No trajectory is drawn and no synthetic object is substituted."
              action={
                <button className="btn btn-primary" onClick={() => void c.reload()}>
                  Rescan
                </button>
              }
            />
          </Panel>
        </section>
      </div>
    );
  }

  return (
    <div>
      <PageHead
        kicker="SPATIO-TEMPORAL TRACKING"
        title="Extreme Event Tracking"
        sub={`${event.title} · ${event.tier} detection. Replayed across the ${c.analysis.domain.spanKm} km analysis window. The track holds only the frames where the object was actually detected.`}
        right={
          <Badge tone={c.origin === "GPS" ? "green" : "muted"}>
            {c.origin ?? "SELECTED LOCATION"} · VARUN-X AI OUTPUT
          </Badge>
        }
      />

      <section className="section">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <EventSelect
            events={c.events}
            value={c.eventId}
            onSelect={(ev) => {
              c.selectEvent(ev.id);
              c.setTimeIdx(-1);
              setPlaying(false);
            }}
            emptyLabel="NO OBJECT DETECTED"
          />
          <div className="layer-toggle" role="group" aria-label="Layer">
            {LAYERS.map((k) => (
              <button key={k} className={`layer-btn ${kind === k ? "active" : ""}`} onClick={() => setKind(k)}>
                {k.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            className="btn btn-cyan btn-sm"
            onClick={() => {
              if (playing) {
                setPlaying(false);
              } else {
                if ((c.timeIdx < 0 ? len - 1 : c.timeIdx) >= len - 1) c.setTimeIdx(0);
                setPlaying(true);
              }
            }}
            disabled={len < 2}
            aria-label={playing ? "Pause tracking" : "Play tracking"}
          >
            <Icon name={playing ? "pause" : "play"} size={13} />
            {playing ? "Pause" : "Play"}
          </button>
        </div>

        <div className="timeline" style={{ marginBottom: 14 }}>
          {event.track.map((p, i) => (
            <button key={p.tLabel} className={`timeline-btn ${i === c.timeIdx ? "active" : ""}`} onClick={() => c.setTimeIdx(i)}>
              {p.tLabel}
            </button>
          ))}
        </div>

        <div className="grid-2c">
          <Panel
            title={`TRAJECTORY + FOOTPRINT - ${event.id}`}
            meta={c.trackPoint?.tLabel ?? "—"}
            flush
          >
            <MapBox
              center={c.trackPoint ?? c.center ?? undefined}
              zoom={6}
              height={480}
              event={event}
              field={field}
              kind={kind}
              timeIdx={c.timeIdx}
              showOverlay
              showTrack
              showRadar
            />
          </Panel>

          <div className="console-stack">
            <EventTelemetry event={event} timeIdx={c.timeIdx} hasFrame={!!c.frame} />
            <Panel title="STEP-BY-STEP REFINEMENT" meta="TARGETED REGION (PROTOTYPE)">
              <div className="small muted" style={{ marginBottom: 8 }}>
                The diffusion target region follows the detected footprint. Refinement is a prototype
                stage; it is labelled as such in the provenance table.
              </div>
              <div className="flow">
                {neighbourLabels(event, c.timeIdx).map((l) => (
                  <span key={l} className="step">{l}</span>
                ))}
              </div>
            </Panel>
            <Panel title="FIELD AVAILABILITY" meta={`${kind.toUpperCase()} GRID`}>
              {field ? (
                <div className="kv">
                  <dt>Grid</dt><dd className="mono">{field.w}×{field.h}</dd>
                  <dt>Valid</dt><dd className="mono">{c.frame?.label}</dd>
                  <dt>Unit</dt><dd className="mono">{field.unit}</dd>
                  <dt>Provenance</dt>
                  <dd>
                    <Badge tone={c.analysis.provenance?.[kind]?.real ? "green" : "amber"}>
                      {c.analysis.provenance?.[kind]?.real ? "SERVER" : "PROTOTYPE MODEL OUTPUT"}
                    </Badge>
                  </dd>
                </div>
              ) : (
                <p className="small muted" style={{ margin: 0 }}>
                  The server returned no {kind} grid for this frame. Nothing is drawn to fill it.
                </p>
              )}
            </Panel>
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead num="// RISK EVOLUTION" title="Intensity Through Time" />
        <Panel title={`${event.id} - SERVER DETECTION HISTORY`} meta="SPARS SERIES · NO SPREAD BAND" flush>
          <div style={{ padding: "14px 10px 6px" }}>
            <RiskEvolutionChart event={event} />
          </div>
        </Panel>
      </section>
    </div>
  );
}

function neighbourLabels(event: AnalysisEvent, timeIdx: number): string[] {
  const at = timeIdx < 0 ? event.track.length - 1 : timeIdx;
  const out: string[] = [];
  if (at > 0) out.push(event.track[at - 1].tLabel);
  if (event.track[at]) out.push(event.track[at].tLabel);
  if (at < event.track.length - 1) out.push(event.track[at + 1].tLabel);
  return out;
}

function EventTelemetry({
  event,
  timeIdx,
  hasFrame,
}: {
  event: AnalysisEvent;
  timeIdx: number;
  hasFrame: boolean;
}) {
  const at = timeIdx < 0 ? event.track.length - 1 : timeIdx;
  const p = event.track[at];
  const nowPoint = event.track.find((x) => x.hours === 0) ?? null;
  const detail: DetailedTrackPoint | undefined = event.detailedTrack?.find((d) => d.hours === p?.hours);

  if (!p) {
    return (
      <Panel title="EVENT TELEMETRY" meta="NO FRAME">
        <DataState icon="alert" title="NO TRACK POINT" desc="This event has no detected frames." />
      </Panel>
    );
  }

  const dLat = nowPoint ? p.lat - nowPoint.lat : 0;
  const dLon = nowPoint ? (p.lon - nowPoint.lon) * 111 * Math.cos((p.lat * Math.PI) / 180) : 0;
  const distKm = nowPoint ? Math.round(Math.hypot(dLat, dLon)) : null;

  return (
    <Panel title="EVENT TELEMETRY" meta={<span className="mono">{p.tLabel}</span>}>
      <div className="stack">
        <div className="kv">
          <dt>Centre lat</dt><dd className="mono">{p.lat.toFixed(3)}</dd>
          <dt>Centre lon</dt><dd className="mono">{p.lon.toFixed(3)}</dd>
          <dt>Intensity</dt><dd className="mono">{p.intensity.toFixed(2)}</dd>
          <dt>vs NOW</dt>
          <dd className="mono">
            {distKm === null
              ? "no NOW frame"
              : `${distKm} km · ${p.intensity - (nowPoint?.intensity ?? p.intensity) >= 0 ? "+" : "-"}${Math.abs(p.intensity - (nowPoint?.intensity ?? p.intensity)).toFixed(2)}`}
          </dd>
          <dt>Footprint</dt>
          <dd className="mono">{detail ? `${Math.round(detail.areaKm2).toLocaleString()} km²` : "PENDING"}</dd>
          <dt>Radius</dt><dd className="mono">{detail ? `${Math.round(detail.radiusKm)} km` : "PENDING"}</dd>
          <dt>Motion</dt>
          <dd className="mono">{detail ? `${Math.round(detail.bearing)}° at ${detail.speedKmh.toFixed(1)} km/h` : "PENDING"}</dd>
          <dt>Risk</dt><dd><RiskBadge risk={event.risk} /></dd>
          <dt>Status</dt>
          <dd>
            <Badge tone={event.activeNow ? "green" : "cyan"} dot>
              {event.activeNow ? "ACTIVE NOW" : `LAST ACTIVE ${event.lastActiveLabel}`}
            </Badge>
          </dd>
        </div>
        {!hasFrame && (
          <p className="small muted" style={{ margin: 0 }}>
            The server returned a track point without a matching frame grid, so no field layer is drawn
            for this step.
          </p>
        )}
        <div className="kv-grid">
          <Metric label="Lead time" value={lead(p.hours)} note="relative to reference time" />
          <Metric label="Detection tier" value={event.tier} note="server classification" />
        </div>
      </div>
    </Panel>
  );
}
