import { PageHead } from "../components/PageHead";
import { Panel, Badge, SectionHead, Metric, DataState } from "../components/primitives";
import { FieldCanvas, LegendRamp } from "../components/FieldCanvas";
import { EventSelect } from "../components/MapBox";
import { useConsoleAnalysis, useFrameRefinement } from "../lib/console";

export function DownscalePage() {
  return (
    <div>
      <PageHead
        kicker="DIFFUSION DOWNSCALING"
        title="Conditional Diffusion Downscaling"
        sub="Targeted refinement of the regions identified by the GNN. The coarse and refined grids below are both returned by the server's refine endpoint. This stage is prototype output: real inference requires a trained production model and a verified data pipeline."
        right={<Badge tone="muted">PROTOTYPE MODEL OUTPUT</Badge>}
      />
      <HeroCompare />
      <UncertaintySection />
      <MethodSection />
    </div>
  );
}

function HeroCompare() {
  const c = useConsoleAnalysis();
  const r = useFrameRefinement(c, "precip");
  // Narrowed once so the metrics panel can read the grid geometry directly.
  const coarse = r.coarse;
  const refined = r.refined;

  return (
    <section className="section">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <EventSelect
          events={c.events}
          value={c.eventId}
          onSelect={(ev) => c.selectEvent(ev.id)}
          emptyLabel="NO OBJECT DETECTED IN THE ANALYSIS WINDOW"
        />
        <div className="timeline">
          {c.event?.track.map((p, i) => (
            <button
              key={p.tLabel}
              className={`timeline-btn ${i === c.timeIdx ? "active" : ""}`}
              onClick={() => c.setTimeIdx(i)}
            >
              {p.tLabel}
            </button>
          ))}
        </div>
      </div>

      <Panel
        title="SIDE-BY-SIDE: COARSE FORECAST → REFINED FIELD"
        meta={
          r.metrics
            ? `${c.eventId ?? "NO OBJECT"} · ${r.frameLabel || c.frame?.label} · SERVER REFINEMENT`
            : "VARUN-X SERVER"
        }
        flush
      >
        {r.status === "loading" ? (
          <div style={{ padding: 14 }}>
            <DataState icon="alert" title="REQUESTING REFINEMENT" desc="Asking the server for a coarse/refined pair." />
          </div>
        ) : r.status === "unavailable" ? (
          <div style={{ padding: 14 }}>
            <DataState
              icon="alert"
              title="REFINEMENT UNAVAILABLE"
              desc={r.error ?? "The server did not return a refinement. No grid is upsampled in the browser."}
              action={
                <button className="btn btn-primary" onClick={r.reload}>
                  Retry
                </button>
              }
            />
          </div>
        ) : !coarse || !refined ? (
          <div style={{ padding: 14 }}>
            <DataState
              icon="alert"
              title="NO REFINEMENT FOR THIS STEP"
              desc={
                c.event
                  ? "The server did not return a coarse/refined pair for the selected frame. Nothing is drawn in its place."
                  : "No object was detected, so there is no target region to refine."
              }
            />
          </div>
        ) : (
          <>
            <div className="compare">
              <div className="compare-cell">
                <FieldCanvas field={coarse} width={640} height={520} label="COARSE PARENT GRID" />
              </div>
              <div className="compare-cell">
                <FieldCanvas field={refined} width={640} height={520} label="SERVER-REFINED GRID" />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: 12, flexWrap: "wrap" }}>
              <LegendRamp kind="precip" labels={["DRY", "MODERATE", "HEAVY", "EXTREME"]} className="browseflow" />
              {r.metrics && (
                <span className="hud mono">
                  {r.metrics.coarseCellKm.toFixed(1)} KM → {r.metrics.fineCellKm.toFixed(1)} KM ·{" "}
                  {r.metrics.tailPreserved ? "EXTREME SIGNAL PRESERVED" : "TAIL NOT PRESERVED"}
                </span>
              )}
            </div>
          </>
        )}
      </Panel>

      {r.metrics && (
        <div className="console" style={{ marginTop: 14 }}>
          <Panel title="GRID GEOMETRY" meta="FROM THE SERVER">
            <div className="kv-grid">
              <Metric label="Coarse cells" value={`${coarse!.w} × ${coarse!.h}`} note="server parent grid" />
              <Metric label="Refined cells" value={`${refined!.w} × ${refined!.h}`} note="server refined grid" />
              <Metric
                label="Grid factor"
                value={`×${(refined!.w / Math.max(1, coarse!.w)).toFixed(1)}`}
                note="density increase"
              />
              <Metric label="Compute scope" value="Targeted" note="only high-risk windows" />
              <Metric label="Samples" value={String(r.metrics.samples)} note="diffusion draws" />
              <Metric label="Mass drift" value={`${r.metrics.massDriftPct.toFixed(2)}%`} note="conservation check" />
            </div>
          </Panel>
          <Panel title="WHY NOT DOWNSCALE EVERYWHERE?">
            <div className="stack">
              {[
                "Diffusing the full globe at 5 km is prohibitively expensive.",
                "The GNN isolates where fine detail changes decisions.",
                "Targeted diffusion keeps extreme peaks sharp where they matter.",
                "Uncertainty is quantified per refine window, not globally.",
              ].map((t) => (
                <div className="row-line" key={t}>
                  <Badge tone="cyan">REFINE</Badge>
                  <span className="rl-s">{t}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </section>
  );
}

function UncertaintySection() {
  const c = useConsoleAnalysis();
  const r = useFrameRefinement(c, "efi");

  return (
    <section className="section">
      <SectionHead
        num="// UNCERTAINTY"
        title="Probabilistic Output, Not Single Values"
        sub="A diffusion sample is one draw. VARUN-X surfaces per-window uncertainty so authorities act with probabilistic awareness."
      />
      <div className="two-col">
        <Panel
          title="REFINED FIELD - EFI"
          meta={r.refined ? `${c.eventId ?? "NO OBJECT"} · ${r.frameLabel || c.frame?.label}` : "VARUN-X SERVER"}
          flush
        >
          {r.refined ? (
            <>
              <FieldCanvas field={r.refined} width={620} height={480} label="REFINED EFI" />
              <div style={{ padding: 12 }}>
                <LegendRamp kind="efi" labels={["NORMAL", "ELEVATED", "HIGH", "EXTREME"]} />
              </div>
            </>
          ) : (
            <div style={{ padding: 14 }}>
              <DataState
                icon="alert"
                title={r.status === "loading" ? "LOADING" : "NO REFINED FIELD"}
                desc={
                  r.status === "unavailable"
                    ? (r.error ?? "The server did not return a refinement.")
                    : "No refined EFI grid is available for the selected step."
                }
                action={
                  <button className="btn btn-primary" onClick={r.reload}>
                    Retry
                  </button>
                }
              />
            </div>
          )}
        </Panel>
        <Panel title="UNCERTAINTY FIELD" meta="SERVER SPREAD ACROSS SAMPLES" flush>
          {r.uncertainty ? (
            <>
              <FieldCanvas field={r.uncertainty} width={620} height={480} label="UNCERTAINTY" />
              <div style={{ padding: 12 }}>
                <LegendRamp kind="anomaly" labels={["LOW σ", "MODERATE", "HIGH σ"]} />
              </div>
            </>
          ) : (
            <div style={{ padding: 14 }}>
              <DataState
                icon="alert"
                title="NO UNCERTAINTY FIELD"
                desc={
                  r.status === "loading"
                    ? "Asking the server for the sample spread."
                    : "The server did not return an uncertainty grid. A spread field is not synthesised in the browser."
                }
              />
            </div>
          )}
        </Panel>
      </div>
      {r.constraints.length > 0 && (
        <Panel title="PHYSICS CONSTRAINTS" meta="SERVER REPORT" >
          <div className="list-2">
            {r.constraints.map((k) => (
              <div key={k.name}>
                <strong className="small" style={{ color: "var(--text)" }}>{k.name}</strong>
                <p className="small muted" style={{ marginTop: 2 }}>{k.status}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </section>
  );
}

function MethodSection() {
  return (
    <section className="section">
      <SectionHead num="// METHOD" title="How Conditional Diffusion Is Applied" />
      <Panel>
        <div className="list-2">
          {[
            ["Input", "Coarse NWP field with conditioning variables."],
            ["Conditioning", "GNN-detected target region and hazard class condition the reverse process."],
            ["Sampling", "Multiple denoising trajectories produce an ensemble of refined fields."],
            ["Physics constraints", "Post-sampling constraints keep output meteorologically consistent."],
            ["Output", "Higher-resolution probabilistic fields, with the server's reported grid spacing."],
            ["Verification", "Scores against observations are required before any operational claim."],
          ].map(([a, b]) => (
            <div key={a}>
              <strong className="small" style={{ color: "var(--text)" }}>{a}</strong>
              <p className="small muted" style={{ marginTop: 2 }}>{b}</p>
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}
