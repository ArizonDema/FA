const {
  REPORT_READINESS_STATUSES,
  VALIDATION_SEVERITIES,
  VALIDATION_STATUSES,
} = require("../validation.constants")

class ReportReadinessService {
  static summarizeChecks(checks = []) {
    return checks.reduce(
      (summary, check) => {
        if (check.status === VALIDATION_STATUSES.PASS) summary.passedChecks += 1
        if (check.status === VALIDATION_STATUSES.WARNING) summary.warningChecks += 1
        if (check.status === VALIDATION_STATUSES.FAIL) summary.failedChecks += 1
        if (check.status === VALIDATION_STATUSES.SKIPPED) summary.skippedChecks += 1
        return summary
      },
      {
        totalChecks: checks.length,
        passedChecks: 0,
        warningChecks: 0,
        failedChecks: 0,
        skippedChecks: 0,
      },
    )
  }

  static determine({ checks = [] }) {
    const summary = this.summarizeChecks(checks)
    const hasFail = checks.some((check) => check.status === VALIDATION_STATUSES.FAIL)
    const hasWarning = checks.some(
      (check) =>
        check.status === VALIDATION_STATUSES.WARNING ||
        (check.status === VALIDATION_STATUSES.FAIL && check.severity === VALIDATION_SEVERITIES.WARNING),
    )

    let overallStatus = VALIDATION_STATUSES.PASS
    let readinessStatus = REPORT_READINESS_STATUSES.READY

    if (hasFail) {
      overallStatus = VALIDATION_STATUSES.FAIL
      readinessStatus = REPORT_READINESS_STATUSES.NOT_READY
    } else if (hasWarning) {
      overallStatus = VALIDATION_STATUSES.WARNING
      readinessStatus = REPORT_READINESS_STATUSES.READY_WITH_WARNINGS
    }

    return {
      overallStatus,
      readinessStatus,
      summary,
    }
  }
}

module.exports = ReportReadinessService
