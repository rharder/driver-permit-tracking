'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, Mail, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { copyInvitationText, createFamilyInvitation, type InvitedRole } from '@/lib/family-invitation';

type MemberRowProps = {
  email: string;
  role: InvitedRole;
  inviterName?: string | null;
  disabled: boolean;
  invitationOpen: boolean;
  onToggleInvitation: () => void;
  onRemove: () => void;
};

export function FamilyMemberRow({ email, role, inviterName, disabled, invitationOpen, onToggleInvitation, onRemove }: MemberRowProps) {
  const invitationId = useId();
  return (
    <div className="member-row">
      <div className="member-row-heading">
        <span><strong>{email}</strong><small>{role === 'supervisor' ? 'Supervising adult' : 'View only'}</small></span>
        <div className="member-row-actions">
          <Button variant="ghost" type="button" disabled={disabled} onClick={onToggleInvitation} aria-label={`Invitation for ${email}`} aria-expanded={invitationOpen} aria-controls={invitationOpen ? invitationId : undefined}><Mail size={16} /> Invite</Button>
          <Button variant="destructive" size="icon" type="button" disabled={disabled} onClick={onRemove} aria-label={`Remove ${email}`}><Trash2 size={16} /></Button>
        </div>
      </div>
      {invitationOpen && <InvitationCard key={`${email}:${role}`} id={invitationId} email={email} role={role} inviterName={inviterName} disabled={disabled} />}
    </div>
  );
}

function InvitationCard({ id, email, role, inviterName, disabled }: Pick<MemberRowProps, 'email' | 'role' | 'inviterName' | 'disabled'> & { id: string }) {
  const [copyStatus, setCopyStatus] = useState<'ready' | 'copying' | 'copied' | 'manual'>('ready');
  const emailButton = useRef<HTMLButtonElement>(null);
  const manualText = useRef<HTMLTextAreaElement>(null);
  const invitation = createFamilyInvitation({ email, role, inviterName, appUrl: process.env.NEXT_PUBLIC_SITE_URL || undefined });

  useEffect(() => {
    emailButton.current?.focus({ preventScroll: true });
    emailButton.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  useEffect(() => {
    if (copyStatus === 'manual') {
      manualText.current?.focus();
      manualText.current?.select();
    }
  }, [copyStatus]);

  async function copyInvitation() {
    setCopyStatus('copying');
    const copied = await copyInvitationText(invitation.text, navigator.clipboard);
    setCopyStatus(copied ? 'copied' : 'manual');
  }

  return (
    <section id={id} className="invitation-card" aria-label={`Share invitation with ${email}`}>
      <strong>Share invitation</strong>
      <p>Access is ready. Email opens a draft in your mail app; you choose when to send it. Or copy the invitation into a message.</p>
      <div className="invitation-actions">
        <Button ref={emailButton} type="button" disabled={disabled} onClick={() => window.location.assign(invitation.mailto)}><Mail /> Email invitation</Button>
        <Button variant="outline" type="button" disabled={disabled || copyStatus === 'copying'} onClick={() => void copyInvitation()}>{copyStatus === 'copied' ? <Check /> : <Copy />} {copyStatus === 'copied' ? 'Copied' : copyStatus === 'copying' ? 'Copying…' : 'Copy invitation'}</Button>
      </div>
      <output className="invitation-feedback">{copyStatus === 'copied' ? 'Invitation copied. Paste it into an email or message.' : copyStatus === 'manual' ? 'Automatic copying is unavailable. Select and copy the invitation below.' : 'No email is sent automatically.'}</output>
      {copyStatus === 'manual' && <label className="invitation-manual">Invitation text<textarea ref={manualText} readOnly rows={7} value={invitation.text} onFocus={(event) => event.currentTarget.select()} /></label>}
    </section>
  );
}
