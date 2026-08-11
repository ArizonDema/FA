export function BrandMark({ className = "", title = "Navicera" }) {
  const classes = ["brand-symbol", className].filter(Boolean).join(" ")

  return (
    <svg
      className={classes}
      viewBox="0 0 64 64"
      role="img"
      aria-label={`${title} mark`}
    >
      <rect className="brand-symbol-background" width="64" height="64" rx="14" />
      <path
        className="brand-symbol-rail"
        d="M13 14h18l15 15h7v8H42L27 22H13v-8Z"
      />
      <path
        className="brand-symbol-rail"
        d="M13 27h15l15 15h6v8H39L24 35H13v-8Z"
      />
      <path
        className="brand-symbol-rail"
        d="M13 40h18l10 10H13V40Z"
      />
      <rect className="brand-symbol-endpoint" x="44" y="43" width="11" height="11" rx="3" />
    </svg>
  )
}

export function BrandLockup({ context, compact = false }) {
  return (
    <div className={compact ? "brand-lockup compact" : "brand-lockup"}>
      <BrandMark />
      <div className="brand-lockup-copy">
        <strong>Navicera</strong>
        {context ? <span>{context}</span> : null}
      </div>
    </div>
  )
}
