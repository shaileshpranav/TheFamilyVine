import type { Invite } from '../api/client'

/** The link a relative opens to accept an invite. */
export function inviteUrl(invite: Invite) {
  return `${window.location.origin}/invite/${invite.token}`
}
