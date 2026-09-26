import { Check, Copy } from '@phosphor-icons/react'
import { useState } from 'react'
import type { Invite } from '../api/client'
import { inviteUrl } from '../lib/invites'

export function CopyButton({ text, label = 'Copy link' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : label}
    </button>
  )
}

export function InviteLink({ invite }: { invite: Invite }) {
  const url = inviteUrl(invite)
  return (
    <div className="invite-link">
      <code>{url}</code>
      <CopyButton text={url} label="Copy" />
    </div>
  )
}
