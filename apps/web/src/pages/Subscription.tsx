import { useCallback } from 'react';
import { Check, Clock3, Layers3, Sparkles } from 'lucide-react';
import type { SubscriptionPlan } from '@ifms/contracts';
import { api } from '../api';
import { useResource } from '../hooks';
import { Badge, Loading, Notice, PageHeading } from '../ui';

const freeFeatures = ['Portfolio management', 'Stock search', 'Historical market data', 'Watchlist management'];
const proFeatures = ['Planned AI insights', 'Portfolio risk analysis', 'Forecasting', 'Intelligent alerts'];

export function SubscriptionPage() {
  const load = useCallback(() => api.get<SubscriptionPlan[]>('subscription-plans'), []);
  const { data, loading, error, refresh } = useResource(load);
  return <>
    <PageHeading eyebrow="YOUR WORKSPACE" title="Subscription Plans">Everything you use today is included with Free. Explore what is planned for the future.</PageHeading>
    {error && <Notice>{error}<button className="inline-button" onClick={refresh}>Retry</button></Notice>}
    {loading && !data ? <Loading label="Loading subscription plans..."/> : <div className="subscription-grid">
      {data?.filter(plan => plan.code === 'free' || plan.code === 'pro').map(plan => {
        const free = plan.code === 'free';
        const Icon = free ? Layers3 : Sparkles;
        return <section key={plan.id} aria-labelledby={`plan-${plan.code}`} className={`subscription-card ${free ? 'subscription-current' : 'subscription-planned'}`}>
          <div className="subscription-card-top"><span className="subscription-icon"><Icon size={24}/></span><Badge tone={free ? 'green' : 'neutral'}>{free ? 'Current Plan' : 'Coming Soon'}</Badge></div>
          <h2 id={`plan-${plan.code}`}>{plan.name}</h2>
          <p className="subscription-description">{plan.description}</p>
          {free ? <div className="subscription-price"><strong>{new Intl.NumberFormat('en-US', { style: 'currency', currency: plan.currency, maximumFractionDigits: 0 }).format(Number(plan.priceMonthly))}</strong><span>/month</span></div>
            : <div className="subscription-future"><Clock3 size={18}/><strong>Coming Soon</strong><span>No price announced</span></div>}
          <h3>{free ? 'Included in your workspace' : 'Planned capabilities'}</h3>
          <ul className="subscription-features">{(free ? freeFeatures : proFeatures).map(feature => <li key={feature}><Check size={17} aria-hidden="true"/><span>{feature}</span></li>)}</ul>
          <div className="subscription-card-footer">{free ? 'Included with every IFMS account' : 'Not available yet. Pro cannot be purchased.'}</div>
        </section>;
      })}
    </div>}
    <div className="subscription-assurance"><Check size={19} aria-hidden="true"/><p><strong>Your current access stays the same.</strong> All users retain existing IFMS functionality. Pro features are planned and are not available in this prototype.</p></div>
  </>;
}
