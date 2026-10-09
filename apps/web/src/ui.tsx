import { useEffect, useRef, type ReactNode } from 'react';
import { AlertCircle, ArrowRight, LoaderCircle, X } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Loading({ label = 'Loading your workspace…' }: { label?: string }) {
  return <div className="loading-state" role="status"><LoaderCircle className="spin" size={22}/><span>{label}</span></div>;
}
export function Notice({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'success' | 'info' }) {
  return <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}><AlertCircle size={18}/><div>{children}</div></div>;
}
export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{children}</p>{action}</div>;
}
export function PageHeading({ eyebrow, title, children, action }: { eyebrow: string; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="page-heading flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{children}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}
export function Panel({ title, subtitle, action, children, className = '' }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{title && <div className="panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>}{children}</section>;
}
export function TextLink({ to, children }: { to: string; children: ReactNode }) { return <Link to={to} className="text-link">{children}<ArrowRight size={15}/></Link>; }
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'demo' | 'warning' | 'green' }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
    const previous = document.activeElement as HTMLElement | null;
    return () => { node?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="modal" onCancel={event => { event.preventDefault(); close.current(); }} aria-labelledby="dialog-title"><div className="modal-heading"><h2 id="dialog-title">{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>{children}</dialog>;
}
export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) { return <button className="button button-primary" type="submit" disabled={pending}>{pending && <LoaderCircle size={16} className="spin"/>}{pending ? 'Please wait…' : children}</button>; }
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
