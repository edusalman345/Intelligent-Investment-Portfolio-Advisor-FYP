import { cleanup,render,screen } from '@testing-library/react';
import { afterEach,expect,it,vi } from 'vitest';
import type { PriceBar,Valuation } from '@ifms/contracts';
import { AllocationChart,PriceChart } from './charts';
const captured=vi.hoisted(()=>({doughnut:{} as Record<string,unknown>,line:{} as Record<string,unknown>}));
vi.mock('react-chartjs-2',()=>({Doughnut:(props:Record<string,unknown>)=>{captured.doughnut=props;return <div/>;},Line:(props:Record<string,unknown>)=>{captured.line=props;return <div/>;}}));
afterEach(cleanup);
function tooltip(props:Record<string,unknown>) {
  return (props.options as {plugins:{tooltip:{callbacks:{label:(item:{label:string;dataIndex:number;parsed:number})=>string}}}}).plugins.tooltip.callbacks.label;
}
it('allocation legend and tooltip preserve exact API values while geometry uses numbers',()=> {
  const value='9999999999999999.00000000';
  const valuation:Valuation={asOf:'2026-01-01T00:00:00Z',baseCurrency:'USD',totalMarketValue:value,cashValue:'0',totalValue:value,
    unpricedPositionCount:0,stalePositionCount:0,isDemo:true,positions:[{assetId:'demo',symbol:'DEMO',quantity:'1',price:value,marketValue:value,source:'fixture',asOf:'2026-01-01T00:00:00Z',isStale:false,isDemo:true}]};
  render(<AllocationChart valuation={valuation}/>);
  expect(screen.getByText('$9,999,999,999,999,999.00')).toBeVisible();
  expect(tooltip(captured.doughnut)({label:'DEMO',dataIndex:0,parsed:1e16})).toBe('DEMO: $9,999,999,999,999,999.00');
});
it('price tooltip formats the original closing price rather than its numeric geometry',()=> {
  const bar:PriceBar={time:'2026-01-01T00:00:00Z',open:'9007199254740993.01',high:'9007199254740994',low:'9007199254740993',close:'9007199254740993.01',volume:null,source:'fixture',isDemo:true};
  render(<PriceChart bars={[bar]} currency="USD"/>);
  expect(tooltip(captured.line)({label:'',dataIndex:0,parsed:9007199254740994})).toBe('$9,007,199,254,740,993.01');
});
