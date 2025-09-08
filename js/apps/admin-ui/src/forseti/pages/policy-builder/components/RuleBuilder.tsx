import {
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  FormGroup,
  Select,
  SelectList,
  SelectOption,
  MenuToggle,
  MenuToggleElement,
  Button,
  ActionList,
  ActionListItem,
  Divider,
  TextInput,
  Alert,
  AlertVariant,
} from "@patternfly/react-core";
import { PlusIcon, TrashIcon } from "@patternfly/react-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BuilderState, Group, Clause, ClauseKind, ClauseOperator, GroupOperator } from "../../../types/policy-builder-types";
import { FillBlanks } from "./FillBlanks";
import { CodePreview } from "./CodePreview";

interface Props {
  state: BuilderState;
  onChange: (s: BuilderState) => void;
}

export function RuleBuilder({ state, onChange }: Props) {
  const { t } = useTranslation();
  const [showPreview, setShowPreview] = useState(true);

  const updateRoot = (root: Group) => onChange({ ...state, root });
  const setRootOp = (op: GroupOperator) => updateRoot({ ...state.root, op });

  const addClause = (path: number[] = []) => updateRoot(addClauseAt(state.root, path));
  const addGroup = (path: number[] = []) => updateRoot(addGroupAt(state.root, path));
  const removeAt = (path: number[]) => updateRoot(removeItemAt(state.root, path));

  return (
    <div className="pf-v5-u-display-flex pf-v5-u-flex-direction-column pf-v5-u-gap-lg">
      <FillBlanks state={state} onChange={onChange} />

      <Card className="pf-v5-u-box-shadow-md">
        <CardHeader>
          <CardTitle className="pf-v5-u-font-size-lg">{t("forseti.policyBuilder.policyRules", "Policy Rules (Visual)")}</CardTitle>
        </CardHeader>
        <CardBody>
          <FormGroup label={t("forseti.policyBuilder.rootLogic", "Root logic")} fieldId="rb-root-op">
            <GroupOperatorSelect value={state.root.op} onChange={setRootOp} id="rb-root-op" />
          </FormGroup>

          <Divider className="pf-v5-u-my-md" />

          <GroupEditor
            group={state.root}
            path={[]}
            onChange={updateRoot}
            onAddClause={addClause}
            onAddGroup={addGroup}
            onRemove={removeAt}
            level={0}
          />

          <ActionList className="pf-v5-u-justify-content-flex-start pf-v5-u-mt-md">
            <ActionListItem>
              <Button variant="primary" icon={<PlusIcon />} onClick={() => addClause([])}>
                {t("forseti.policyBuilder.addCondition", "Add Condition")}
              </Button>
            </ActionListItem>
            <ActionListItem>
              <Button variant="secondary" icon={<PlusIcon />} onClick={() => addGroup([])}>
                {t("forseti.policyBuilder.addGroup", "Add Group")}
              </Button>
            </ActionListItem>
            <ActionListItem>
              <Button variant="link" onClick={() => setShowPreview((s) => !s)}>
                {showPreview ? t("hidePreview", "Hide Preview") : t("showPreview", "Show Preview")}
              </Button>
            </ActionListItem>
          </ActionList>

          {state.root.items.length === 0 && (
            <Alert isInline variant={AlertVariant.info} title={t("forseti.policyBuilder.noRules", "No rules yet")}>
              {t("forseti.policyBuilder.addFirstCondition", "Add your first condition or group.")}
            </Alert>
          )}
        </CardBody>
      </Card>

      {showPreview && <CodePreview state={state} />}
    </div>
  );
}

function GroupOperatorSelect({ value, onChange, id }: { value: GroupOperator; onChange: (v: GroupOperator) => void; id: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Select
      isOpen={open}
      selected={value}
      onOpenChange={setOpen}
      onSelect={(_, v) => { onChange(v as GroupOperator); setOpen(false); }}
      toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
        <MenuToggle ref={toggleRef} isExpanded={open} onClick={() => setOpen(!open)} aria-label={t("forseti.policyBuilder.toggleGroupLogic", "Toggle group logic")}>
          {value === "AND" ? t("forseti.policyBuilder.allConditions", "ALL conditions (AND)") : t("forseti.policyBuilder.anyCondition", "ANY condition (OR)")}
        </MenuToggle>
      )}
      id={id}
    >
      <SelectList>
        <SelectOption value="AND">{t("forseti.policyBuilder.allConditions", "ALL conditions (AND)")}</SelectOption>
        <SelectOption value="OR">{t("forseti.policyBuilder.anyCondition", "ANY condition (OR)")}</SelectOption>
      </SelectList>
    </Select>
  );
}

function GroupEditor({
  group,
  path,
  level,
  onChange,
  onAddClause,
  onAddGroup,
  onRemove,
}: {
  group: Group;
  path: number[];
  level: number;
  onChange: (g: Group) => void;
  onAddClause: (p: number[]) => void;
  onAddGroup: (p: number[]) => void;
  onRemove: (p: number[]) => void;
}) {
  const { t } = useTranslation();

  const updateAtIndex = (index: number, node: Group | Clause) => {
    const items = [...group.items];
    items[index] = node as any;
    onChange({ ...group, items });
  };

  return (
    <div className={level === 0 ? "" : "pf-v5-u-ml-lg pf-v5-u-pl-md pf-v5-u-border-left"}>
      {group.items.map((item, idx) => (
        <div key={idx} className="pf-v5-u-mb-md pf-v5-u-p-md pf-v5-u-border pf-v5-u-border-radius-sm">
          {"items" in (item as any) ? (
            <>
              <FormGroup label={t("forseti.policyBuilder.groupLogic", "Group logic")} fieldId={`group-op-${path.join("-")}-${idx}`}>
                <GroupOperatorSelect
                  id={`group-op-${path.join("-")}-${idx}`}
                  value={(item as Group).op}
                  onChange={(op) => updateAtIndex(idx, { ...(item as Group), op })}
                />
              </FormGroup>

              <GroupEditor
                group={item as Group}
                path={[...path, idx]}
                level={level + 1}
                onChange={(g) => updateAtIndex(idx, g)}
                onAddClause={onAddClause}
                onAddGroup={onAddGroup}
                onRemove={onRemove}
              />

              <ActionList className="pf-v5-u-justify-content-flex-start">
                <ActionListItem>
                  <Button variant="secondary" onClick={() => onAddClause([...path, idx])}>
                    {t("forseti.policyBuilder.addCondition", "Add Condition")}
                  </Button>
                </ActionListItem>
                <ActionListItem>
                  <Button variant="secondary" onClick={() => onAddGroup([...path, idx])}>
                    {t("forseti.policyBuilder.addGroup", "Add Group")}
                  </Button>
                </ActionListItem>
                <ActionListItem>
                  <Button variant="link" icon={<TrashIcon />} onClick={() => onRemove([...path, idx])}>
                    {t("removeGroup", "Remove group")}
                  </Button>
                </ActionListItem>
              </ActionList>
            </>
          ) : (
            <ClauseEditor
              clause={item as Clause}
              idx={`${path.join("-")}-${idx}`}
              onChange={(c) => updateAtIndex(idx, c)}
              onRemove={() => onRemove([...path, idx])}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function ClauseEditor({ clause, onChange, onRemove, idx }: { clause: Clause; onChange: (c: Clause) => void; onRemove: () => void; idx: string }) {
  const { t } = useTranslation();
  const [kindOpen, setKindOpen] = useState(false);
  const [opOpen, setOpOpen] = useState(false);

  const update = (patch: Partial<Clause>) => onChange({ ...clause, ...patch });

  const operatorLabel: Record<ClauseOperator, string> = {
    eq: t("forseti.ops.eq", "equals"),
    neq: t("forseti.ops.neq", "does not equal"),
    contains: t("forseti.ops.contains", "contains"),
    starts: t("forseti.ops.starts", "starts with"),
  };

  return (
    <div className="pf-v5-u-display-flex pf-v5-u-flex-direction-column pf-v5-u-gap-md">
      <FormGroup label={t("forseti.policyBuilder.whatToCheck", "What to check")} fieldId={`clause-kind-${idx}`}>
        <Select
          isOpen={kindOpen}
          selected={clause.kind}
          onOpenChange={setKindOpen}
          onSelect={(_, v) => { update({ kind: v as ClauseKind, key: v === "claim" ? (clause.key ?? "") : undefined }); setKindOpen(false); }}
          toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
            <MenuToggle ref={toggleRef} onClick={() => setKindOpen(!kindOpen)} isExpanded={kindOpen} aria-label={t("forseti.policyBuilder.toggleCheck", "Toggle what to check")}>
              {clause.kind === "claim" ? t("forseti.kinds.claim", "User Claim") : clause.kind === "path" ? t("forseti.kinds.path", "Request Path") : t("forseti.kinds.method", "HTTP Method")}
            </MenuToggle>
          )}
          id={`clause-kind-${idx}`}
        >
          <SelectList>
            <SelectOption value="claim">{t("forseti.kinds.claim", "User Claim")}</SelectOption>
            <SelectOption value="path">{t("forseti.kinds.path", "Request Path")}</SelectOption>
            <SelectOption value="method">{t("forseti.kinds.method", "HTTP Method")}</SelectOption>
          </SelectList>
        </Select>
      </FormGroup>

      {clause.kind === "claim" && (
        <FormGroup label={t("forseti.policyBuilder.claimName", "Claim name")} fieldId={`clause-claim-${idx}`} isRequired>
          <TextInput
            id={`clause-claim-${idx}`}
            value={clause.key ?? ""}
            onChange={(_, v) => update({ key: String(v) })}
            placeholder="role"
            aria-label={t("forseti.policyBuilder.claimAria", "Claim key")}
            validated={clause.key ? "default" : "error"}
          />
        </FormGroup>
      )}

      <FormGroup label={t("forseti.policyBuilder.operator", "Operator")} fieldId={`clause-op-${idx}`}>
        <Select
          isOpen={opOpen}
          selected={clause.op}
          onOpenChange={setOpOpen}
          onSelect={(_, v) => { update({ op: v as ClauseOperator }); setOpOpen(false); }}
          toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
            <MenuToggle ref={toggleRef} onClick={() => setOpOpen(!opOpen)} isExpanded={opOpen} aria-label={t("forseti.policyBuilder.toggleOperator", "Toggle operator")}>
              {operatorLabel[clause.op]}
            </MenuToggle>
          )}
          id={`clause-op-${idx}`}
        >
          <SelectList>
            <SelectOption value="eq">{operatorLabel["eq"]}</SelectOption>
            <SelectOption value="neq">{operatorLabel["neq"]}</SelectOption>
            <SelectOption value="contains">{operatorLabel["contains"]}</SelectOption>
            <SelectOption value="starts">{operatorLabel["starts"]}</SelectOption>
          </SelectList>
        </Select>
      </FormGroup>

      <FormGroup label={t("forseti.policyBuilder.value", "Value")} fieldId={`clause-val-${idx}`} isRequired>
        <TextInput
          id={`clause-val-${idx}`}
          value={clause.value}
          onChange={(_, v) => update({ value: String(v) })}
          placeholder={clause.kind === "method" ? "GET" : clause.kind === "path" ? "/api/private" : "admin"}
          aria-label={t("forseti.policyBuilder.valueAria", "Clause value")}
          validated={clause.value ? "default" : "error"}
        />
      </FormGroup>

      <ActionList className="pf-v5-u-justify-content-flex-start">
        <ActionListItem>
          <Button variant="link" icon={<TrashIcon />} onClick={onRemove}>
            {t("remove", "Remove")}
          </Button>
        </ActionListItem>
      </ActionList>

      {/* Readable sentence */}
      <Alert isInline variant={AlertVariant.info} title={t("forseti.policyBuilder.readsAs", "Reads as:")}>
        {clause.kind === "claim" && clause.key ? `"${clause.key}"` : clause.kind} {operatorLabel[clause.op]} "{clause.value || t("empty", "(empty)")}"
      </Alert>
    </div>
  );
}

/* ----------------- immutable helpers for group editing ----------------- */

function addClauseAt(group: Group, path: number[]): Group {
  const clause: Clause = { kind: "method", op: "eq", value: "GET" };
  if (path.length === 0) return { ...group, items: [...group.items, clause] };
  const [i, ...rest] = path;
  const items = [...group.items];
  const node = items[i];
  if (node && "items" in (node as any)) items[i] = addClauseAt(node as Group, rest);
  return { ...group, items };
}

function addGroupAt(group: Group, path: number[]): Group {
  const newGroup: Group = { op: "AND", items: [] };
  if (path.length === 0) return { ...group, items: [...group.items, newGroup] };
  const [i, ...rest] = path;
  const items = [...group.items];
  const node = items[i];
  if (node && "items" in (node as any)) items[i] = addGroupAt(node as Group, rest);
  return { ...group, items };
}

function removeItemAt(group: Group, path: number[]): Group {
  if (path.length === 0) return group;
  if (path.length === 1) {
    const items = [...group.items];
    items.splice(path[0], 1);
    return { ...group, items };
  }
  const [i, ...rest] = path;
  const items = [...group.items];
  const node = items[i];
  if (node && "items" in (node as any)) items[i] = removeItemAt(node as Group, rest);
  return { ...group, items };
}
