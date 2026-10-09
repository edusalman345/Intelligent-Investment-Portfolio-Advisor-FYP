import { ArcElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';
import type { PriceBar, Valuation } from '@ifms/contracts';
import { money, shortDate } from './format';

ChartJS.register(ArcElement, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip);

export function PriceChart({ bars, currency }: { bars: PriceBar[]; currency: string }) {
  const data = { labels: bars.map(bar => shortDate(bar.time)), datasets: [{ label: `Closing price (${currency})`, data: bars.map(bar => Number(bar.close)), borderColor: '#177b69', backgroundColor: '#177b6912', pointRadius: 0, pointHoverRadius: 5, borderWidth: 2.5, fill: true, tension: 0.25 }] };
  return <div className="price-chart"><Line data={data} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: item => money(bars[item.dataIndex]?.close, currency) } } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 6, color: '#77847e', font: { size: 11 } }, border: { display: false } }, y: { position: 'right', grid: { color: '#eef1eb' }, border: { display: false }, ticks: { maxTicksLimit: 5, color: '#77847e', callback: value => money(String(value), currency) } } } }} role="img" aria-label={`Closing price history from ${bars[0]?.time ?? ''} to ${bars[bars.length - 1]?.time ?? ''}`}/></div>;
}
const allocationColors = ['#177b69', '#9dbdab', '#dda461', '#729399', '#bfc9b9', '#827260'];
export function AllocationChart({ valuation }: { valuation: Valuation }) {
  const positions = valuation.positions.filter(position => position.marketValue !== null && Number(position.marketValue) > 0);
  const labels = [...positions.map(position => position.symbol), ...(Number(valuation.cashValue) > 0 ? ['Cash'] : [])];
  const rawValues = [...positions.map(position => position.marketValue!), ...(Number(valuation.cashValue) > 0 ? [valuation.cashValue] : [])];
  const values = rawValues.map(value => Number(value));
  if (!values.length) return <p className="muted chart-empty">Allocation appears after you add funded holdings.</p>;
  return <div className="allocation"><div className="allocation-chart"><Doughnut data={{ labels, datasets: [{ data: values, backgroundColor: labels.map((_, index) => allocationColors[index % allocationColors.length]!), borderWidth: 4, borderColor: '#fff', hoverOffset: 3 }] }} options={{ responsive: true, maintainAspectRatio: false, cutout: '76%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: item => `${item.label}: ${money(rawValues[item.dataIndex], valuation.baseCurrency)}` } } } }} role="img" aria-label="Portfolio allocation by market value"/></div><ul className="allocation-legend">{labels.map((label, index) => <li key={label}><span className="legend-dot" style={{ backgroundColor: allocationColors[index % allocationColors.length] }}/><span>{label}</span><strong>{money(rawValues[index], valuation.baseCurrency)}</strong></li>)}</ul></div>;
}
