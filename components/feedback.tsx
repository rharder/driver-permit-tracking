'use client';

import { ExternalLink, MessageSquare, WifiOff } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FEEDBACK_ISSUES_URL, NEW_FEEDBACK_URL } from '@/lib/feedback';

export function Feedback({ online }: { online: boolean }) {
  return <div className="feedback-entry">
    <Dialog>
      <DialogTrigger render={<Button type="button" variant="link" className="feedback-trigger" />}>
        <MessageSquare size={16} /> Feedback
      </DialogTrigger>
      <DialogContent className="permit-dialog scroll-dialog sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Help improve Permit Hours</DialogTitle>
          <DialogDescription>Report a problem, suggest an improvement, or ask a question on GitHub.</DialogDescription>
        </DialogHeader>
        <div className="scroll-dialog-body feedback-body">
          <p>You’ll need a GitHub account to post. You can browse existing feedback without one.</p>
          <p className="feedback-privacy"><strong>Reports are public.</strong> Please leave out driver names, email addresses, permit numbers, and driving logs. Remove personal information from screenshots. Nothing from your log or account is attached automatically.</p>
          {!online && <output className="feedback-offline"><WifiOff size={18} /><span>You’re offline. These links need an internet connection; feedback is not queued for sending.</span></output>}
          <a className={buttonVariants({ className: 'feedback-action' })} href={NEW_FEEDBACK_URL} target="_blank" rel="noopener noreferrer">Open a new issue <ExternalLink size={16} /><span className="sr-only"> (opens GitHub in a new tab)</span></a>
          <a className="feedback-browse" href={FEEDBACK_ISSUES_URL} target="_blank" rel="noopener noreferrer">Browse existing feedback <ExternalLink size={15} /><span className="sr-only"> (opens GitHub in a new tab)</span></a>
        </div>
        <DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Close</DialogClose></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
