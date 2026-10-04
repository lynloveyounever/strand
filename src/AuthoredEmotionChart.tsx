import { emotionColors, emotionCurveSeries } from './audience';
import type { Occurrence } from './temporal';
export const emotionLabels = { curiosity: '好奇', tension: '緊張', trust: '信任', sadness: '悲傷', relief: '釋然' };
/** The same adjacent-only authored series used by AudienceExperience. */
export default function AuthoredEmotionChart({ list, selectedId }: { list: Occurrence[]; selectedId: string }) {
  const series = emotionCurveSeries(list), width = Math.max(680, list.length * 110);
  const count = series.reduce((n, s) => n + s.points.length, 0);
  const x = (i: number) => 36 + (i + .5) * (width - 60) / Math.max(1, list.length), y = (v: number) => 168 - v * 1.35;
  return <section className="focus-emotion-score" aria-label="這條理解線的作者情緒曲線">
    <div className="navigator-section-heading"><h3>情緒線</h3><small>理解步序 · 作者設定，並非實測</small></div>
    {!count ? <p className="navigator-empty">尚未填寫情緒數值，沒有可顯示的曲線</p> : <><div className="navigator-emotion-legend">{series.map(s => <span key={s.emotion} style={{ color: emotionColors[s.emotion] }}>{emotionLabels[s.emotion]} · {s.points.length} 點</span>)}</div><div className="navigator-chart-scroll" tabIndex={0} aria-label="橫向捲動情緒曲線"><svg viewBox={`0 0 ${width} 202`} width={width} height="202" role="img" aria-label="作者設定情緒曲線；空白不補零，相鄰同情緒值才連線">
      {[0, 50, 100].map(v => <g key={v}><line x1="32" x2={width - 12} y1={y(v)} y2={y(v)} stroke="currentColor" opacity=".15"/><text x="4" y={y(v) + 4} fill="currentColor" fontSize="11">{v}</text></g>)}
      {list.map((o, i) => <g key={o.id}><text x={x(i)} y="193" textAnchor="middle" fill="currentColor" fontSize="11">{i + 1}</text>{o.id === selectedId && <line x1={x(i)} x2={x(i)} y1="20" y2="177" stroke="currentColor" strokeDasharray="3 4" opacity=".65"/>}</g>)}
      {series.map(s => <g key={s.emotion} data-focus-emotion={s.emotion}>{s.segments.map(({ from, to }) => <line key={to.id} data-focus-emotion-segment={s.emotion} x1={x(from.index)} x2={x(to.index)} y1={y(from.value)} y2={y(to.value)} stroke={emotionColors[s.emotion]} strokeWidth="2"/>)}{s.points.map(pt => <circle key={pt.id} cx={x(pt.index)} cy={y(pt.value)} r={pt.id === selectedId ? 5 : 3} fill={emotionColors[s.emotion]}><title>理解第 {pt.index + 1} 步 · {emotionLabels[s.emotion]} {pt.value}</title></circle>)}</g>)}
    </svg></div></>}
    <small>只連接相鄰且已填值的同一情緒；空白保留斷線，單點不延伸</small>
  </section>;
}
