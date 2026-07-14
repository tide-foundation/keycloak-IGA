/** TIDECLOAK IMPLEMENTATION */

import {
  ExpandableSection,
  List,
  ListItem,
  Stack,
  StackItem,
  Text,
  TextContent,
  TextVariants,
} from "@patternfly/react-core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * A single ON-toggle commit failure as carried on the toggle POST response
 * body's `warnings.commitFailures`. Mirrors `ToggleIGACommitFailure` in the
 * admin-client `tideProvider`, redeclared here so this presentation module does
 * not depend on the admin-client package shape.
 */
export type IgaCommitFailure = {
  crId?: string;
  actionType?: string;
  outcome?: string;
  message?: string;
};

/**
 * The synthetic converge/closure-sweep entry is reported as a commit failure
 * but is NOT a per-CR failure, so it is excluded from the "N change requests
 * failed" count and rendered as a single closure line instead.
 */
export const SIGN_DEFAULTS_SWEEP = "SIGN_DEFAULTS_SWEEP";

/**
 * Strip the exception-prefix noise the backend concatenates into the flat
 * status `error.message` / sweep message into plain words.
 *
 * The backend surfaces things like:
 *   "CONVERGE_FAILED:RuntimeException: ORK unreachable"
 *   "SIGN_DEFAULTS_SWEEP:java.net.ConnectException: Connection refused"
 * Users do not need the `WORD:ClassName:` machine prefix. We drop leading
 * `UPPER_SNAKE:` tags and `some.package.ClassName:` / `ClassName:` qualifiers,
 * keeping the human-readable tail. Returns a trimmed single line (never the raw
 * blob); falls back to the input when nothing recognisable is found.
 */
export function normalizeToggleMessage(raw?: string | null): string {
  if (!raw) {
    return "";
  }
  let msg = raw.trim();
  // Drop a leading UPPER_SNAKE_CASE status tag, e.g. "CONVERGE_FAILED:".
  msg = msg.replace(/^[A-Z][A-Z0-9_]+:\s*/, "");
  // Drop a leading (possibly dotted) Java class/exception name, e.g.
  // "java.lang.RuntimeException:" or "RuntimeException:".
  msg = msg.replace(
    /^(?:[A-Za-z_$][\w$]*\.)*[A-Z][\w$]*(?:Exception|Error)?:\s*/,
    "",
  );
  // Collapse internal whitespace/newlines so a multi-line blob renders as one
  // tidy line.
  msg = msg.replace(/\s+/g, " ").trim();
  return msg || raw.trim();
}

/**
 * Friendly, human-readable label for a commit failure: prefer a normalised
 * `actionType` (UPPER_SNAKE -> Title Case), fall back to a generic label.
 */
function friendlyActionType(actionType?: string): string {
  if (!actionType) {
    return "Change request";
  }
  return actionType
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Short, human entity label for a failure: a friendly CR id, else a fallback. */
function friendlyEntity(failure: IgaCommitFailure): string | undefined {
  if (failure.crId) {
    // CR ids can be long uuids; show a short, recognisable head.
    return failure.crId.length > 12
      ? `${failure.crId.slice(0, 8)}…`
      : failure.crId;
  }
  return undefined;
}

const MAX_VISIBLE = 5;

type IgaToggleWarningDetailProps = {
  /**
   * Structured per-CR failures from the toggle POST body, when available. When
   * empty/undefined the component falls back to the flat `message`.
   */
  commitFailures?: IgaCommitFailure[];
  /**
   * Flat warning/error string from the polled status (`error.message`), used
   * when no structured `commitFailures` are available (e.g. inside the modal,
   * which only sees the polled status).
   */
  message?: string | null;
  /** Tone of the surrounding block, drives the heading colour. */
  tone?: "warning" | "danger";
};

/**
 * Clean, scannable presentation of an IGA ON-toggle warning:
 *  - a one-line headline (how many CRs were left pending, or a single closure
 *    line),
 *  - a SHORT structured list (friendly action type + entity), capped at
 *    MAX_VISIBLE with an "and N more" tail,
 *  - raw technical detail (outcome / exception text) tucked behind a
 *    collapsible "Details" section rather than dumped inline.
 *
 * When no structured failures are present it degrades to a single normalised
 * line built from `message` (the modal's only data source).
 */
export const IgaToggleWarningDetail = ({
  commitFailures,
  message,
  tone = "warning",
}: IgaToggleWarningDetailProps) => {
  const { t } = useTranslation();
  const [detailExpanded, setDetailExpanded] = useState(false);

  const failures = commitFailures ?? [];
  const perCrFailures = failures.filter(
    (f) => f.actionType !== SIGN_DEFAULTS_SWEEP,
  );
  const sweepFailure = failures.find(
    (f) => f.actionType === SIGN_DEFAULTS_SWEEP,
  );
  const count = perCrFailures.length;

  const headingClass =
    tone === "danger"
      ? "pf-v5-u-danger-color-100"
      : "pf-v5-u-warning-color-100";

  // No structured per-CR failures: either a pure closure-sign failure or the
  // modal's flat-message-only case. Render a single concise normalised line.
  if (count === 0) {
    const closureMsg = normalizeToggleMessage(sweepFailure?.message ?? message);
    return (
      <TextContent>
        <Text component={TextVariants.p} className={headingClass}>
          {t("igaToggleWarningClosureLine")}
        </Text>
        {closureMsg && (
          <Text component={TextVariants.small} className="pf-v5-u-color-200">
            {closureMsg}
          </Text>
        )}
      </TextContent>
    );
  }

  const visible = perCrFailures.slice(0, MAX_VISIBLE);
  const remaining = perCrFailures.length - visible.length;

  // Collect any raw technical lines (outcome / exception text + sweep message)
  // for the collapsible Details section so they are available but never inline.
  const rawLines = [
    ...perCrFailures.map((f) => f.outcome || f.message).filter(Boolean),
    sweepFailure?.message,
    message,
  ].filter((l): l is string => Boolean(l));

  return (
    <Stack hasGutter>
      <StackItem>
        <TextContent>
          <Text component={TextVariants.p} className={headingClass}>
            {t("igaToggleWarningHeadline", { count })}
          </Text>
        </TextContent>
      </StackItem>
      <StackItem>
        <List isPlain data-testid="iga-toggle-warning-list">
          {visible.map((f, i) => {
            const entity = friendlyEntity(f);
            return (
              <ListItem key={f.crId ?? `${f.actionType ?? "cr"}-${i}`}>
                {friendlyActionType(f.actionType)}
                {entity ? ` — ${entity}` : ""}
              </ListItem>
            );
          })}
          {remaining > 0 && (
            <ListItem>
              <Text
                component={TextVariants.small}
                className="pf-v5-u-color-200"
              >
                {t("igaToggleWarningAndMore", { count: remaining })}
              </Text>
            </ListItem>
          )}
        </List>
      </StackItem>
      {rawLines.length > 0 && (
        <StackItem>
          <ExpandableSection
            toggleText={t("igaToggleWarningDetails")}
            isExpanded={detailExpanded}
            onToggle={(_e, v) => setDetailExpanded(v)}
            data-testid="iga-toggle-warning-details"
          >
            <List isPlain>
              {rawLines.map((line, i) => (
                <ListItem key={i}>
                  <Text
                    component={TextVariants.small}
                    className="pf-v5-u-color-200"
                  >
                    {line}
                  </Text>
                </ListItem>
              ))}
            </List>
          </ExpandableSection>
        </StackItem>
      )}
    </Stack>
  );
};
