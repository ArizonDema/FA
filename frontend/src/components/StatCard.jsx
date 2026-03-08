export function StatCard({ label, value, tone = "default" }) {
  return (
    <article className={`stat-card ${tone}`}>
      <p>{label}</p>
      <h3>{value}</h3>
    </article>
  )
}
