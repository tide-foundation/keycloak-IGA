/** TIDECLOAK IMPLEMENTATION */

import {
  Button,
  Modal,
  ModalVariant,
  Text,
  TextContent,
  TextList,
  TextListItem,
  TextListItemVariants,
  TextListVariants,
  TextVariants,
} from "@patternfly/react-core";

type ChangeRequestsHelpModalProps = {
  onClose: () => void;
};

export function ChangeRequestsHelpModal({
  onClose,
}: ChangeRequestsHelpModalProps) {
  return (
    <Modal
      variant={ModalVariant.medium}
      title="How IGA works"
      isOpen
      onClose={onClose}
      actions={[
        <Button key="close" variant="link" onClick={onClose}>
          Close
        </Button>,
      ]}
    >
      <TextContent>
        <Text component={TextVariants.p}>
          When IGA is enabled for this realm, administrative changes (creating
          or editing users, roles, groups, clients, client scopes, and so on)
          are not applied immediately. Instead they become Change Requests that
          must be reviewed and approved first.
        </Text>

        <Text component={TextVariants.h3}>The flow</Text>
        <TextList component={TextListVariants.ol}>
          <TextListItem component={TextListItemVariants.li}>
            You make a change in the admin console as normal.
          </TextListItem>
          <TextListItem component={TextListItemVariants.li}>
            Instead of applying, it is captured as a Change Request. You will
            see a &quot;Change request created&quot; notification with a link to
            this screen.
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
            Requests can also be Denied. Status is one of Pending, Approved, or
            Denied, shown on this screen.
          </TextListItem>
        </TextList>

        <Text component={TextVariants.h3}>Who can approve</Text>
        <Text component={TextVariants.p}>
          By default any admin with realm-manage permission can authorize and
          commit, with a threshold of 1. Administrators can restrict approval to
          specific roles and raise the threshold per realm or per group, role,
          or client.
        </Text>

        <Text component={TextVariants.h3}>Where</Text>
        <Text component={TextVariants.p}>
          This Change Requests screen lists Pending, Approved, and Denied
          requests. Open one to see details, who has signed, progress toward the
          threshold, and Authorize / Commit / Deny actions. Bulk actions are
          available on the Pending list.
        </Text>

        <Text component={TextVariants.p}>
          For configuring thresholds and approver roles, see the IGA
          administrator guide.
        </Text>
      </TextContent>
    </Modal>
  );
}
