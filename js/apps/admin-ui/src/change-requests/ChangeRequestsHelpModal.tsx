/** TIDECLOAK IMPLEMENTATION */

import {
  Modal,
  ModalVariant,
  Text,
  TextContent,
  TextList,
  TextListItem,
  TextListItemVariants,
  TextListVariants,
  TextVariants,
  useWizardContext,
  Wizard,
  WizardFooter,
  WizardStep,
} from "@patternfly/react-core";
import { useTranslation } from "react-i18next";
import groupIgaThresholdImg from "./assets/group-iga-threshold.png";
import realmIgaScopeModeImg from "./assets/realm-iga-scope-mode.png";
import realmIgaThresholdImg from "./assets/realm-iga-threshold.png";
import userRoleMappingHrApproverImg from "./assets/user-role-mapping-hr-approver.png";

type ChangeRequestsHelpModalProps = {
  onClose: () => void;
};

type ScreenshotProps = {
  src: string;
  caption: string;
};

/**
 * A real captured admin-console screenshot with its caption, styled to match
 * the placeholder it replaces (bordered, constrained width, captioned).
 */
function Screenshot({ src, caption }: ScreenshotProps) {
  return (
    <div className="pf-v5-u-my-md pf-v5-u-text-align-center">
      <img
        src={src}
        alt={caption}
        style={{
          maxWidth: "100%",
          height: "auto",
          border: "1px solid var(--pf-v5-global--BorderColor--100)",
          borderRadius: "var(--pf-v5-global--BorderRadius--sm)",
        }}
      />
      <Text
        component={TextVariants.small}
        className="pf-v5-u-color-200 pf-v5-u-mt-xs"
      >
        {caption}
      </Text>
    </div>
  );
}

/**
 * Custom wizard footer matching the in-app pattern
 * (see UserFederationKerberosWizard / NewClientForm). The wizard's "close"
 * action is wired to dismiss the surrounding modal, and the final step shows
 * a Finish button that also closes the modal.
 */
function HelpWizardFooter({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { activeStep, steps, goToNextStep, goToPrevStep } = useWizardContext();
  const isLastStep = activeStep.index === steps.length;

  return (
    <WizardFooter
      activeStep={activeStep}
      onNext={isLastStep ? onClose : goToNextStep}
      onBack={goToPrevStep}
      onClose={onClose}
      isBackDisabled={activeStep.index === 1}
      backButtonText={t("back")}
      nextButtonText={isLastStep ? t("finish") : t("next")}
      cancelButtonText={t("close")}
    />
  );
}

export function ChangeRequestsHelpModal({
  onClose,
}: ChangeRequestsHelpModalProps) {
  return (
    <Modal
      variant={ModalVariant.medium}
      title="How IGA works"
      isOpen
      onClose={onClose}
      hasNoBodyWrapper
      aria-label="How IGA works"
    >
      <Wizard
        height={520}
        footer={<HelpWizardFooter onClose={onClose} />}
        onClose={onClose}
      >
        {/* Step 1 — What IGA does */}
        <WizardStep name="What IGA does" id="iga-help-what">
          <TextContent>
            <Text component={TextVariants.p}>
              When IGA is enabled for this realm, administrative changes
              (creating or editing users, roles, groups, clients, client scopes,
              and so on) are not applied immediately. Instead they become Change
              Requests that must be reviewed and approved first.
            </Text>

            <Text component={TextVariants.h3}>The flow</Text>
            <TextList component={TextListVariants.ol}>
              <TextListItem component={TextListItemVariants.li}>
                You make a change in the admin console as normal.
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                Instead of applying, it is captured as a Change Request. You
                will see a &quot;Change request created&quot; notification with
                a link to this screen.
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                An authorized admin Authorizes (signs) the request. This records
                approval but does not apply it yet.
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                Once it has enough authorizations (the threshold), an authorized
                admin Commits it. That is when the change is actually applied.
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                Requests can also be Denied. Status is one of Pending, Approved,
                or Denied, shown on this screen.
              </TextListItem>
            </TextList>

            <Text component={TextVariants.h3}>Who can approve</Text>
            <Text component={TextVariants.p}>
              By default any admin with realm-manage permission can authorize
              and commit, with a threshold of 1. Administrators can restrict
              approval to specific roles and raise the threshold per realm or
              per group, role, or client. The following steps explain how to set
              this up.
            </Text>

            <Text component={TextVariants.h3}>Where</Text>
            <Text component={TextVariants.p}>
              This Change Requests screen lists Pending, Approved, and Denied
              requests. Open one to see details, who has signed, progress toward
              the threshold, and Authorize / Commit / Deny actions. Bulk actions
              are available on the Pending list.
            </Text>
          </TextContent>
        </WizardStep>

        {/* Step 2 — Enable or disable IGA */}
        <WizardStep name="Enable or disable IGA" id="iga-help-enable">
          <TextContent>
            <Text component={TextVariants.p}>
              IGA is controlled by the case-sensitive realm attribute{" "}
              <code>isIGAEnabled</code>; it is on only when the value is exactly
              the string <code>true</code>. The <code>master</code> realm is
              always exempt and is never intercepted.
            </Text>
            <TextList component={TextListVariants.ol}>
              <TextListItem component={TextListItemVariants.li}>
                Enable: set realm attribute <code>isIGAEnabled = true</code> (or
                call{" "}
                <code>
                  POST /admin/realms/&#123;realm&#125;/tide-admin/toggle-iga
                </code>
                ). Enabling is applied directly and is not itself governed; IGA
                only engages on the next privileged write. Treat the enable as a
                deliberate, trusted operation done after governance is
                configured.
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                Disable: once IGA is on, setting{" "}
                <code>isIGAEnabled = false</code> is itself a governed{" "}
                <code>SET_REALM_ATTRIBUTE</code> change request that must be
                authorized and committed before IGA actually turns off. You
                cannot unilaterally disable governance once it is active.
              </TextListItem>
            </TextList>
          </TextContent>
        </WizardStep>

        {/* Step 3 — Set the approval threshold */}
        <WizardStep name="Set the approval threshold" id="iga-help-threshold">
          <TextContent>
            <Text component={TextVariants.p}>
              The threshold is the number of distinct admin signatures required
              before a change request can be committed. The default is{" "}
              <strong>1</strong>. A non-integer value, or a value less than 1,
              is ignored and treated as 1 (enforced) — a bad value can never
              disable the commit gate.
            </Text>

            <Text component={TextVariants.h3}>
              Set the realm-wide threshold
            </Text>
            <TextList component={TextListVariants.ol}>
              <TextListItem component={TextListItemVariants.li}>
                Admin console: go to <strong>Realm settings → General</strong>{" "}
                and find the{" "}
                <strong>Identity Governance and Administration (IGA)</strong>{" "}
                section. Set <strong>IGA approval threshold</strong> to the
                positive integer you want, for example <code>2</code>, then
                Save.
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                Admin REST equivalent: update the realm representation{" "}
                <code>attributes</code> map via{" "}
                <code>PUT /admin/realms/&#123;realm&#125;</code>, including{" "}
                <code>
                  &#123; &quot;attributes&quot;: &#123;
                  &quot;iga.threshold&quot;: &quot;2&quot; &#125; &#125;
                </code>
                .
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                Result: any change request that does not resolve a higher
                per-entity threshold now requires 2 distinct admin signatures.
              </TextListItem>
            </TextList>
            <Screenshot
              src={realmIgaThresholdImg}
              caption="Screenshot: Realm settings → General → Identity Governance and Administration (IGA) section (set IGA approval threshold = 2)"
            />

            <Text component={TextVariants.h3}>Set a per-entity threshold</Text>
            <Text component={TextVariants.p}>
              You can override the realm default on a specific group, role,
              client, or organization. If multiple affected entities declare a
              threshold, the maximum wins; a per-entity threshold always
              overrides the realm default.
            </Text>
            <TextList component={TextListVariants.ol}>
              <TextListItem component={TextListItemVariants.li}>
                Admin console: open the entity and select its{" "}
                <strong>Attributes</strong> tab (Groups, Realm roles or client
                Roles, Clients, or Organizations → the entity → Attributes). Add
                the key <code>iga.threshold</code> with a positive integer, for
                example <code>3</code>.
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                Admin REST equivalent: add <code>iga.threshold</code> to that
                entity&apos;s representation <code>attributes</code> (for
                example{" "}
                <code>
                  PUT /admin/realms/&#123;realm&#125;/groups/&#123;id&#125;
                </code>{" "}
                with{" "}
                <code>
                  &#123; &quot;attributes&quot;: &#123;
                  &quot;iga.threshold&quot;: [&quot;3&quot;] &#125; &#125;
                </code>
                ).
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                A per-entity threshold only takes effect when the entity is in
                scope for the change request. Typically set{" "}
                <code>iga.threshold</code> and <code>iga.approverRole</code>{" "}
                together on the same entity.
              </TextListItem>
            </TextList>
          </TextContent>
        </WizardStep>

        {/* Step 4 — Restrict who can approve */}
        <WizardStep name="Restrict who can approve" id="iga-help-approver-role">
          <TextContent>
            <Text component={TextVariants.p}>
              By default any admin with <code>manage-realm</code> can authorize
              and commit any change request. To restrict approval, mark the
              affected entities with the attribute <code>iga.approverRole</code>
              . Note that creating top-level entities (users, roles, groups,
              clients, client scopes, organizations) and realm-wide writes are
              not approver-role scoped — they are governed only by{" "}
              <code>manage-realm</code> plus the threshold.
            </Text>
            <TextList component={TextListVariants.ol}>
              <TextListItem component={TextListItemVariants.li}>
                Create the approver Keycloak role: admin console{" "}
                <strong>Realm roles → Create role</strong> (or REST{" "}
                <code>POST /admin/realms/&#123;realm&#125;/roles</code> with{" "}
                <code>
                  &#123; &quot;name&quot;: &quot;hr-approver&quot; &#125;
                </code>
                ).
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                Assign that role only to the admins who should approve this
                scope (they must also hold <code>manage-realm</code>): admin
                console{" "}
                <strong>Users → (user) → Role mapping → Assign role</strong>.
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                Mark the scope entity: on the affected
                group/role/client/organization set{" "}
                <code>iga.approverRole = hr-approver</code> via its{" "}
                <strong>Attributes</strong> tab (or in the REST representation
                <code>attributes</code>), exactly as for a per-entity threshold.
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                Optionally set a per-entity <code>iga.threshold</code> on the
                same entity so multiple holders of that role are required.
              </TextListItem>
            </TextList>
            <Screenshot
              src={groupIgaThresholdImg}
              caption="Screenshot: Group → Attributes tab (add key iga.threshold = 3)"
            />
            <Screenshot
              src={userRoleMappingHrApproverImg}
              caption="Screenshot: Users → (user) → Role mapping → Assign role (assign hr-approver)"
            />

            <Text component={TextVariants.h3}>
              Worked example: only HR can approve changes to the HR group
            </Text>
            <Text component={TextVariants.p}>
              Assume a Keycloak group <code>hr</code> exists and IGA is still
              OFF.
            </Text>
            <TextList component={TextListVariants.ol}>
              <TextListItem component={TextListItemVariants.li}>
                Create the realm role <code>hr-approver</code>.
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                Assign <code>hr-approver</code> to the HR approvers (who also
                hold <code>manage-realm</code>).
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                On the <code>hr</code> group&apos;s Attributes tab, set{" "}
                <code>iga.approverRole = hr-approver</code>.
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                Optionally set <code>iga.threshold = 2</code> on the same group
                to require two HR approvers.
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                Leave <code>iga.scopeMode</code> unset (<code>any</code>).
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                Enable IGA now that governance is configured. Result: change
                requests touching the <code>hr</code> group&apos;s membership or
                role grants can only be authorized and committed by an admin who
                holds both <code>manage-realm</code> and{" "}
                <code>hr-approver</code>; other admins receive HTTP 403.
              </TextListItem>
            </TextList>
          </TextContent>
        </WizardStep>

        {/* Step 5 — Scope mode */}
        <WizardStep name="Scope mode" id="iga-help-scope-mode">
          <TextContent>
            <Text component={TextVariants.p}>
              Scope mode is the realm attribute <code>iga.scopeMode</code>. It
              decides, when more than one approver role is required, whether an
              approver must hold any or all of them. It is realm-level only —
              there is no per-entity scope mode.
            </Text>
            <TextList component={TextListVariants.ul}>
              <TextListItem component={TextListItemVariants.li}>
                <code>any</code> (default; any value other than <code>all</code>
                , or unset): the approver needs at least one of the required
                roles.
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                <code>all</code> (case-insensitive): the approver must hold
                every required role.
              </TextListItem>
            </TextList>
            <Text component={TextVariants.p}>
              Admin console: go to <strong>Realm settings → General</strong> and
              in the{" "}
              <strong>Identity Governance and Administration (IGA)</strong>{" "}
              section set <strong>IGA scope mode</strong> to <code>all</code>{" "}
              (or leave it at <code>any</code>), then Save. Admin REST: include{" "}
              <code>&quot;iga.scopeMode&quot;: &quot;all&quot;</code> in the
              realm representation <code>attributes</code> map via{" "}
              <code>PUT /admin/realms/&#123;realm&#125;</code>.
            </Text>
            <Screenshot
              src={realmIgaScopeModeImg}
              caption="Screenshot: Realm settings → General → Identity Governance and Administration (IGA) section (set IGA scope mode = all)"
            />
          </TextContent>
        </WizardStep>

        {/* Step 6 — Recommended order & pitfalls */}
        <WizardStep name="Recommended order & pitfalls" id="iga-help-order">
          <TextContent>
            <Text component={TextVariants.p}>
              Exact admin console menu labels can differ slightly between
              Keycloak releases and admin themes; where a label may differ in
              your build, the path is described generically and the equivalent
              Admin REST call is given alongside.
            </Text>

            <Text component={TextVariants.h3}>
              Configure governance before enabling IGA
            </Text>
            <Text component={TextVariants.p}>
              Set thresholds and approver roles <strong>before</strong> enabling
              IGA. Once IGA is on, changing the realm <code>iga.threshold</code>{" "}
              (or any realm attribute) is itself a governed{" "}
              <code>SET_REALM_ATTRIBUTE</code> change request that must be
              authorized and committed. If you tighten policy only after
              enabling, those governance changes are blocked behind the
              (possibly weak) policy in force at enable time. The{" "}
              <code>master</code> realm is the escape hatch: IGA is never
              enforced there, so a master realm admin can recover a self-locked
              realm.
            </Text>
            <Text component={TextVariants.p}>Recommended order:</Text>
            <TextList component={TextListVariants.ol}>
              <TextListItem component={TextListItemVariants.li}>
                Decide and set the realm-wide <code>iga.threshold</code>.
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                Decide and set <code>iga.scopeMode</code>.
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                Create approver roles and assign them.
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                Set <code>iga.approverRole</code> / <code>iga.threshold</code>{" "}
                on every sensitive group, role, client, or organization.
              </TextListItem>
              <TextListItem component={TextListItemVariants.li}>
                Enable IGA last.
              </TextListItem>
            </TextList>

            <Text component={TextVariants.h3}>
              Default behavior with nothing configured
            </Text>
            <Text component={TextVariants.p}>
              With no <code>iga.approverRole</code> and no{" "}
              <code>iga.threshold</code> set anywhere, any single admin holding{" "}
              <code>manage-realm</code> can authorize <strong>and</strong>{" "}
              commit any change request with one signature. This is not
              meaningful four-eyes governance — harden it (raise the threshold,
              set approver roles on sensitive scopes, decide scope mode) before
              relying on it, and do that hardening before enabling IGA.
            </Text>
          </TextContent>
        </WizardStep>
      </Wizard>
    </Modal>
  );
}
