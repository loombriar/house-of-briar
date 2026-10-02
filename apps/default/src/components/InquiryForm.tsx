import { useState } from 'react';
import { Send } from '@/lib/icons';
import { submitForm } from '@/lib/genesis-flows';
import { PRODUCT_INQUIRY_FLOW_ID } from '@/lib/marketplace';

type InquiryFormProps = {
  productName: string;
};

export default function InquiryForm({ productName }: InquiryFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('sending');
    setError('');
    try {
      await submitForm(PRODUCT_INQUIRY_FLOW_ID, { name, email, product: productName, message });
      setStatus('sent');
      setName('');
      setEmail('');
      setMessage('');
    } catch (reason) {
      setStatus('error');
      setError(reason instanceof Error ? reason.message : 'The note could not be sent. Please try again.');
    }
  };

  if (status === 'sent') {
    return <div className="rounded-2xl border border-primary/30 bg-accent/40 p-6" role="status"><p className="font-serif text-2xl">Your note is on its way.</p><p className="mt-2 text-sm leading-6 text-muted-foreground">The studio has your question about {productName}. Keep an eye on your inbox for a reply.</p><button type="button" onClick={() => setStatus('idle')} className="mt-5 min-h-11 rounded-full border border-border px-5 text-sm font-medium transition hover:border-primary hover:text-primary">Send another note</button></div>;
  }

  return <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Ask the studio</p><h2 className="mt-2 font-serif text-3xl">Make it personal.</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Ask about fit, materials, shipping, or the story behind this piece.</p></div><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium"><span>Your name</span><input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /></label><label className="space-y-2 text-sm font-medium"><span>Email address</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /></label></div><label className="block space-y-2 text-sm font-medium"><span>Message</span><textarea required rows={5} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="I would love to know…" className="w-full resize-y rounded-xl border border-border bg-background px-3 py-3 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" /></label>{status === 'error' && <p role="alert" className="text-sm text-destructive">{error}</p>}<button type="submit" disabled={status === 'sending'} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60">{status === 'sending' ? 'Sending your note…' : 'Send inquiry'}{status !== 'sending' && <Send size={16} />}</button></form>;
}
