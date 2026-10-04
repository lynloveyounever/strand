import { AtlasIcon } from "./AtlasIcon";
import AudienceRuleEngine from './AudienceRuleEngine';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { editor, useEditor } from "./store";
import { clone, uid } from "./model";
import { patchOccurrence } from "./temporal";
import { createTimelineDemo } from "./sample";
import {
  emotionColors,
  emotionCurveSeries,
  emotionTypes,
  emptyAudienceDesign,
  setAudienceObservations,
  type AudienceDesign,
} from "./audience";
const labels = {
  curiosity: "好奇",
  tension: "緊張",
  trust: "信任",
  sadness: "悲傷",
  relief: "釋然",
};
export default function AudienceExperience({
  onAtlas,
}: {
  onAtlas: () => void;
}) {
  const savedProject = useEditor((s) => s.project),
    selected = useEditor((s) => s.occurrenceId);
  const [preview, setPreview] = useState(false);
  const sample = useMemo(() => createTimelineDemo(), []);
  const [sampleSelected, setSampleSelected] = useState(sample.timelines.audience.placements[0].id);
  const p = preview ? sample : savedProject;
  const list = p.timelines.audience.placements;
  const item = list.find((x) => x.id === (preview ? sampleSelected : selected)) ?? list[0],
    d = item?.audienceDesign ?? emptyAudienceDesign();
  const series = emotionCurveSeries(list);
  const pointCount = series.reduce((count, s) => count + s.points.length, 0);
  const segmentCount = series.reduce((count, s) => count + s.segments.length, 0);
  const expectationCount = list.reduce((count, o) => count + (o.audienceDesign?.expectations.length ?? 0), 0);
  const [simulation, setSimulation] = useState(false);
  const [editing, setEditing] = useState(false),
    [observation, setObservation] = useState(false);
  const title = (id: string) => {
    const x = list.find((x) => x.id === id);
    return x
      ? `${list.indexOf(x) + 1} · ${p.units.find((n) => n.id === x.eventId)?.title}`
      : "Unlinked";
  };
  const select = (id: string) => {
    if (preview) { setSampleSelected(id); return; }
    const x = list.find((x) => x.id === id)!;
    editor.setState({
      basis: "audience",
      occurrenceId: id,
      selectedId: x.eventId,
      playhead: list.indexOf(x) + 0.5,
    });
  };
  const change = (fn: (next: AudienceDesign) => void) => {
    if (preview) return;
    editor.getState().transact((q) => {
      const next = clone(d);
      delete next.example;
      fn(next);
      patchOccurrence(q, "audience", item.id, { audienceDesign: next });
    });
  };
  const scoreElement = useRef<HTMLDivElement>(null);
  const editElement = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  useEffect(() => {
    const node = scoreElement.current;
    if (!node) return;
    const measure = () => setViewportWidth(node.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [simulation, !!item]);
  useEffect(() => {
    if (!editing) return;
    editElement.current?.scrollIntoView?.({ block: "nearest", behavior: "instant" });
    editElement.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
  }, [editing]);
  const width = Math.max(740, list.length * 130, viewportWidth),
    x = (i: number) => 8 + ((i + 0.5) * (width - 16)) / list.length,
    y = (v: number) => 205 - v * 1.45;
  if (simulation) return <AudienceRuleEngine onBack={()=>setSimulation(false)} onAtlas={onAtlas}/>;
  if (!item) return <section className="audience-experience" aria-label="Audience experience design"><div className="experience-shell"><header className="experience-heading"><div><strong className="icon-heading"><AtlasIcon name="audience"/>觀眾體驗</strong><small>{p.title}</small></div><button onClick={onAtlas}>回到空間圖</button></header><div className="experience-empty" role="status"><div><h2>還沒有觀眾理解節點</h2><p>在「時間對應」安排事件後，就能設計每一步的情緒與理解。</p></div><button onClick={() => { setPreview(true); setEditing(false); }}>查看完整曲線示例</button></div></div></section>;
  return (
    <section
      className="audience-experience"
      aria-label="Audience experience design"
    >
      <div className="experience-shell">
      <header className="experience-heading">
        <div>
          <strong className="icon-heading"><AtlasIcon name="audience"/>觀眾體驗</strong>
          <small>
            {d.example
              ? "作者設計範例"
              : "作者設計"}{" "}
            · 曲線不是觀眾實測
          </small>
          <small>{preview ? "完整曲線示例 · 唯讀" : "目前作品"} · {p.title}</small>
        </div>
        <div className="experience-actions">
          <button onClick={() => { setPreview(!preview); setEditing(false); setObservation(false); }}>{preview ? "回到我的作品" : "查看完整曲線示例"}</button>
          {!preview && <button onClick={()=>setSimulation(true)}>▶ 規則模擬</button>}
          <button onClick={onAtlas}>回到空間圖</button>
        </div>
      </header>
      {preview && <p className="experience-preview-note" role="status">唯讀示例；你的作品、選取位置與儲存內容沒有變更</p>}
      <div className={"experience-score " + (pointCount ? "has-values" : "is-empty")}>
      <div className="experience-score-heading"><h2 className="icon-heading"><AtlasIcon name="path"/>情緒軌跡</h2><small>{list.length} 個理解節點 · 作者設計</small></div>
      <div className="experience-legend">
        {series.map(({ emotion: k, points, segments }) => (
          <span key={k} style={{ color: emotionColors[k] }} data-emotion-summary={k}>
            ● {labels[k]} <small>{points.length === 0 ? "未填值" : `${points.length} 點 · ${segments.length} 段`}</small>
          </span>
        ))}
      </div>
      <div className={"experience-curve-status " + (pointCount ? "" : "experience-empty")} aria-label="Emotion curve status">
        {pointCount === 0 && <div className="empty-score-mark" aria-hidden="true"><i/><i/><i/></div>}
        <div className="curve-status-copy">
        <strong>{pointCount === 0 ? "尚未設定情緒數值，所以還沒有曲線" : segmentCount === 0 ? "已有情緒點，還沒有可連接的線段" : `${segmentCount} 條情緒線段`}</strong>
        <details className="score-explainer"><summary>曲線讀法</summary><span>0–100 · 同一情緒在相鄰兩步都有填值才連線；單點只顯示圓點，空白處斷線</span></details>
        </div>
        {pointCount === 0 && !preview && <button className="primary-action" onClick={() => setEditing(true)}>填寫這一步的情緒</button>}
      </div>
      <div
        ref={scoreElement}
        className="experience-scroll"
        tabIndex={0}
        aria-label="Audience emotion curves and linked points; scroll horizontally"
      >
        <div style={{ width, minWidth: "100%" }}>
          {pointCount > 0 && <svg
            className="experience-chart"
            width="100%"
            height="260"
            preserveAspectRatio="none"
            viewBox={`0 0 ${width} 240`}
            role="img"
            aria-label="Authored emotion intensities across audience occurrences. Gaps mean unspecified; lines connect design points, not measured responses."
          >
            {[0, 50, 100].map((v) => (
              <g key={v}>
                <line
                  x1="40"
                  x2={width - 25}
                  y1={y(v)}
                  y2={y(v)}
                  stroke="currentColor"
                  className="emotion-grid-line"
                  vectorEffect="non-scaling-stroke"
                />
                <text x="8" y={y(v) + 4} fill="#98a4b3" fontSize="13">
                  {v}
                </text>
              </g>
            ))}
            <line
              x1={x(list.indexOf(item))}
              x2={x(list.indexOf(item))}
              y1="30"
              y2="220"
              stroke="#eef7ff"
              strokeDasharray="3 5"
              opacity=".4"
            />
            {series.map(({ emotion: k, points, segments }) => (
              <g key={k} stroke={emotionColors[k]} data-emotion-series={k}>
                {segments.map(({ from, to }) => (
                    <line
                      key={to.id}
                      data-emotion-segment={k}
                      x1={x(from.index)}
                      x2={x(to.index)}
                      y1={y(from.value)}
                      y2={y(to.value)}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      opacity=".85"
                    />
                ))}
                {points.map(({ id, index, value }) => (
                    <circle
                      key={id}
                      cx={x(index)}
                      cy={y(value)}
                      r={id === item.id ? 6 : 4}
                      fill={emotionColors[k]}
                      stroke="#151c26"
                      strokeWidth="2"
                    >
                      <title>
                        {title(id)} · {labels[k]} {value}{points.length === 1 ? " · 單點，尚無相鄰值可連線" : ""}
                      </title>
                    </circle>
                ))}
              </g>
            ))}
          </svg>}
          <div
            className="experience-nodes"
            style={{ gridTemplateColumns: `repeat(${list.length},1fr)` }}
          >
            {list.map((o, i) => (
              <button
                key={o.id}
                aria-pressed={o.id === item.id}
                onClick={() => select(o.id)}
              >
                <span className="experience-node-marker">
                  {String(i + 1).padStart(2, "0")}{" "}
                  {o.mode === "repeat" ? "↺" : ""}
                </span>
                <b>{p.units.find((n) => n.id === o.eventId)?.title}</b>
                {o.audienceDesign?.cognition.believes && <small>{o.audienceDesign.cognition.believes}</small>}
                <span className="experience-node-emotions" aria-hidden="true">{emotionTypes.filter(k => o.audienceDesign?.emotions[k] !== undefined).map(k => <i key={k} style={{ backgroundColor: emotionColors[k] }}/>)}</span>
              </button>
            ))}
          </div>
          <div className="expectation-ribbons" aria-label="Authored expectations and response links">
            <p className="expectation-caption">{expectationCount ? `預期 → 回應 · ${expectationCount} 條設計帶` : "尚未設定預期與回應連結"}</p>
            {list.flatMap((o, i) =>
              (o.audienceDesign?.expectations ?? []).map((e) => (
                <button
                  key={o.id + e.id}
                  className={"expectation-ribbon " + e.kind}
                  onClick={() => {
                    select(o.id);
                    if (!preview) setEditing(true);
                  }}
                  style={{
                    marginLeft: `${(i * 100) / list.length}%`,
                    width: `${Math.max(100 / list.length, (((e.responseId ? list.findIndex((a) => a.id === e.responseId) : list.length - 1) - i + 1) * 100) / list.length)}%`,
                  }}
                >
                  <span>
                    {e.kind === "prediction"
                      ? "預測"
                      : e.kind === "hope"
                        ? "希望"
                        : "擔心"}
                  </span>{" "}
                  {e.text}{" "}
                  <b>
                    {" "}
                    {e.response === "open"
                      ? "未回收"
                      : e.response === "subverted"
                        ? "↝ 推翻"
                        : e.response === "delayed"
                          ? "⋯ 延後"
                          : "✓ 實現"}
                    {e.responseId
                      ? ` · ${list.findIndex((a) => a.id === e.responseId) + 1}`
                      : ""}
                  </b>
                </button>
              )),
            )}
          </div>
        </div>
      </div>
      </div>
      <div className="experience-detail">
        <div className="experience-detail-kicker"><span className="section-kicker">此刻的觀眾</span><span>第 {list.indexOf(item) + 1} 步 / {list.length}</span></div>
        <div className="experience-selection">
          <h2>{p.units.find(n => n.id === item.eventId)?.title}</h2>
          {!preview && <div>
            <button
              onClick={() => setEditing(!editing)}
              aria-expanded={editing}
            >
              {editing ? "收起編輯" : "編輯設計"}
            </button>
            <button
              onClick={() => {
                select(item.id);
                onAtlas();
              }}
            >
              在空間圖定位
            </button>
          </div>}
        </div>
        {emotionTypes.some(k => d.emotions[k] !== undefined) && <div className="experience-emotion-readout" aria-label="Selected authored emotion intensities">{emotionTypes.filter(k => d.emotions[k] !== undefined).map(k => <div key={k} style={{ '--emotion-color': emotionColors[k] } as CSSProperties}><span>{labels[k]}</span><b>{d.emotions[k]}<small> / 100</small></b><i><em style={{ width: `${d.emotions[k]}%` }}/></i></div>)}</div>}
        <div className="cognition-cards">
          {(["knows", "believes", "questions"] as const).map((k, i) => (
            <div key={k} data-cognition={k}>
              <small>
                {
                  [
                    "知道 · 已呈現資訊",
                    "相信 · 設計中的解讀",
                    "疑問 · 尚未理解",
                  ][i]
                }
              </small>
              <p className={d.cognition[k] ? "" : "unwritten"}>{d.cognition[k] || "尚未填寫"}</p>
            </div>
          ))}
        </div>
        <div className="support-links">
          <small>支持這個設計的線索</small>
          {d.supportIds.map((id) => (
            <button key={id} onClick={() => select(id)}>
              {title(id)}
            </button>
          ))}
          {!d.supportIds.length && <span>尚未連結</span>}
        </div>
        {!preview && editing && (
          <div className="experience-editor" ref={editElement}>
            <p>這些是作者希望形成的感受與解讀，不會由角色秘密自動推算。</p>
            <fieldset>
              <legend>情緒強度 · 可同時存在</legend>
              {emotionTypes.map((k) => (
                <label key={k}>
                  {labels[k]}{" "}
                  <input
                    type="number"
                    min="0"
                    max="100"
                    aria-label={`${labels[k]} intensity`}
                    value={d.emotions[k] ?? ""}
                    placeholder="未設定"
                    onChange={(e) =>
                      change((n) => {
                        if (e.target.value === "") delete n.emotions[k];
                        else n.emotions[k] = Number(e.target.value);
                      })
                    }
                  />
                </label>
              ))}
            </fieldset>
            <div className="cognition-edit">
              {(["knows", "believes", "questions"] as const).map((k, i) => (
                <label key={k}>
                  {["知道", "相信", "疑問"][i]}
                  <textarea
                    value={d.cognition[k]}
                    onChange={(e) =>
                      change((n) => {
                        n.cognition[k] = e.target.value;
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <label>
              連結支持線索{" "}
              <select
                aria-label="Add supporting clue"
                value=""
                onChange={(e) =>
                  change((n) => {
                    if (!n.supportIds.includes(e.target.value))
                      n.supportIds.push(e.target.value);
                  })
                }
              >
                <option value="">選擇呈現點</option>
                {list
                  .filter(
                    (o) => o.id !== item.id && !d.supportIds.includes(o.id),
                  )
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {title(o.id)}
                    </option>
                  ))}
              </select>
            </label>
            {d.supportIds.map((id) => (
              <button
                key={id}
                onClick={() =>
                  change((n) => {
                    n.supportIds = n.supportIds.filter((x) => x !== id);
                  })
                }
              >
                移除線索 · {title(id)}
              </button>
            ))}
            <fieldset>
              <legend>預期 · 預測 ≠ 希望 ≠ 擔心</legend>
              <p>
                回應點必須在此點之後；刪除或移到此點之前，連結會回復「未回收」。
              </p>
              {d.expectations.map((e) => (
                <div key={e.id} className="expectation-editor">
                  <select
                    aria-label="Expectation kind"
                    value={e.kind}
                    onChange={(v) =>
                      change((n) => {
                        n.expectations.find((a) => a.id === e.id)!.kind = v
                          .target.value as typeof e.kind;
                      })
                    }
                  >
                    <option value="prediction">預測會發生</option>
                    <option value="hope">希望發生</option>
                    <option value="fear">擔心發生</option>
                  </select>
                  <input
                    aria-label="Expectation text"
                    value={e.text}
                    onChange={(v) =>
                      change((n) => {
                        n.expectations.find((a) => a.id === e.id)!.text =
                          v.target.value;
                      })
                    }
                  />
                  <select
                    aria-label="Expectation response"
                    value={e.response}
                    onChange={(v) =>
                      change((n) => {
                        const a = n.expectations.find((a) => a.id === e.id)!;
                        a.response = v.target.value as typeof a.response;
                        a.responseId =
                          a.response === "open"
                            ? null
                            : (a.responseId ??
                              list[list.indexOf(item) + 1]?.id ??
                              null);
                      })
                    }
                  >
                    <option value="open">未回收</option>
                    {list.indexOf(item) < list.length - 1 && (
                      <>
                        <option value="realized">實現</option>
                        <option value="delayed">延後</option>
                        <option value="subverted">推翻</option>
                      </>
                    )}
                  </select>
                  {e.response !== "open" && (
                    <select
                      aria-label="Response occurrence"
                      value={e.responseId ?? ""}
                      onChange={(v) =>
                        change((n) => {
                          n.expectations.find(
                            (a) => a.id === e.id,
                          )!.responseId = v.target.value;
                        })
                      }
                    >
                      {list.slice(list.indexOf(item) + 1).map((o) => (
                        <option key={o.id} value={o.id}>
                          {title(o.id)}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={() =>
                      change((n) => {
                        n.expectations = n.expectations.filter(
                          (a) => a.id !== e.id,
                        );
                      })
                    }
                  >
                    移除預期
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  change((n) => {
                    n.expectations.push({
                      id: uid(),
                      kind: "prediction",
                      text: "",
                      response: "open",
                      responseId: null,
                    });
                  })
                }
              >
                ＋ 新增預期
              </button>
            </fieldset>
          </div>
        )}
        {!preview && <details
          className="audience-observations"
          open={observation}
          onToggle={(e) => setObservation(e.currentTarget.open)}
        >
          <summary>
            實際試映回饋 · {(item.audienceObservations ?? []).length} 則
          </summary>
          <p>獨立記錄觀察與來源，不會改寫上方設計曲線。</p>
          {(item.audienceObservations ?? []).map((o) => (
            <div key={o.id}>
              <b>{o.source}</b>
              <p>{o.note}</p>
              <button
                onClick={() =>
                  editor.getState().transact((q) =>
                    setAudienceObservations(
                      q,
                      item.id,
                      item.audienceObservations!.filter((a) => a.id !== o.id),
                    ),
                  )
                }
              >
                移除回饋
              </button>
            </div>
          ))}
          <form
            key={item.id}
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                source = (form.elements.namedItem("source") as HTMLInputElement)
                  .value,
                note = (form.elements.namedItem("note") as HTMLTextAreaElement)
                  .value;
              const before = editor.getState().project;
              editor
                .getState()
                .transact((q) =>
                  setAudienceObservations(q, item.id, [
                    ...(item.audienceObservations ?? []),
                    { id: uid(), source, note },
                  ]),
                );
              if (editor.getState().project !== before) form.reset();
            }}
          >
            <label>
              回饋來源 / 試映場次
              <input name="source" required maxLength={20000} />
            </label>
            <label>
              實際觀察
              <textarea name="note" required maxLength={20000} />
            </label>
            <button type="submit">儲存實測回饋</button>
          </form>
        </details>}
      </div>
      </div>
    </section>
  );
}
