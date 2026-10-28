import { expect,test, type Page, type TestInfo } from '@playwright/test';

async function captureScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await expect(page.locator('.loading-state')).toHaveCount(0);
  // Chart.js animates the canvas for one second; CSS animation controls do not stop it.
  if (await page.locator('canvas').count()) await page.waitForTimeout(1200);
  await page.screenshot({path:testInfo.outputPath(`${name}.png`),fullPage:true,animations:'disabled'});
}

async function captureMobile(page: Page, testInfo: TestInfo, name: string) {
  await page.setViewportSize({width:390,height:844});
  try {
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  } catch (error) {
    console.log('Mobile sizing',await page.evaluate(()=>({
      viewport:window.innerWidth,scroll:document.documentElement.scrollWidth,
      containers:[...document.querySelectorAll('.workspace,.workspace-main,.content,.page-heading,.portfolio-detail-grid,.panel,.summary-grid,.value-card,.data-banner,.heading-action,.back-link,.workspace-footer')].map(node=>({
        className:node.className,width:node.getBoundingClientRect().width,right:node.getBoundingClientRect().right,
      })),
    })));
    throw error;
  }
  await captureScreenshot(page,testInfo,`${name}-mobile`);
  await page.setViewportSize({width:1280,height:720});
}

test('P1 user registers, records fractional holdings, views provenance and signs in again',async({page},testInfo)=> {
  test.skip(process.env.E2E_REAL_MARKET === '1', 'The real-provider journey runs separately.');
  test.setTimeout(120000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/portfolios');
  await expect(page).toHaveURL(/\/login$/);
  await captureMobile(page,testInfo,'login');
  await page.goto('/register');
  await expect(page.getByRole('button',{name:'Continue with Google'})).toBeDisabled();
  await page.getByLabel('Your name').fill('Demo Investor');
  await page.getByLabel('Email address').fill('browser@example.test');
  await page.getByLabel(/^Password/).fill('too-short');
  await page.getByRole('button',{name:'Create account'}).click();
  expect(await page.getByLabel(/^Password/).evaluate((element: HTMLInputElement)=>element.validity.tooShort)).toBe(true);
  await captureMobile(page,testInfo,'registration');
  await page.getByLabel(/^Password/).fill('local browser testing passphrase');
  await page.getByRole('button',{name:'Create account'}).click();
  await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();
  await page.getByRole('link',{name:'Portfolios',exact:true}).click();
  await page.getByRole('button',{name:'New portfolio',exact:true}).click();
  await page.getByLabel('Portfolio name').fill('P1 demo portfolio');
  await page.getByLabel('Description (optional)').fill('Synthetic fixture data only');
  await page.getByRole('dialog').getByRole('button',{name:'Create portfolio',exact:true}).click();
  await expect(page.getByRole('heading',{name:'P1 demo portfolio'})).toBeVisible();
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByLabel('Portfolio name').fill('P1 edited portfolio');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.getByRole('heading',{name:'P1 edited portfolio'})).toBeVisible();
  await page.getByRole('button',{name:'Add transaction',exact:true}).first().click();
  await page.getByLabel('Transaction type').selectOption('BUY');
  await page.getByRole('combobox',{name:/^Asset/}).selectOption('10000000-0000-4000-8000-000000000001');
  await page.getByLabel(/^Quantity/).fill('-1');
  await page.getByLabel('Price per unit (USD)').fill('100');
  await page.getByRole('button',{name:'Record transaction',exact:true}).click();
  await expect(page.getByText('Enter positive quantity and price values with at most 8 decimal places.')).toBeVisible();
  await captureMobile(page,testInfo,'transaction-validation');
  await page.getByLabel(/^Quantity/).fill('1.5');
  await page.getByRole('button',{name:'Record transaction',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('DEMO VALUATION',{exact:true})).toBeVisible();
  const holdings=page.locator('section').filter({has:page.getByRole('heading',{name:'Holdings',exact:true})});
  await expect(holdings.getByRole('cell',{name:'1.5',exact:true})).toBeVisible();
  await captureScreenshot(page,testInfo,'portfolio-desktop');
  await captureMobile(page,testInfo,'portfolio');
  await page.getByRole('button',{name:'Add transaction',exact:true}).first().click();
  await page.getByLabel('Transaction type').selectOption('SELL');
  await page.getByRole('combobox',{name:/^Asset/}).selectOption('10000000-0000-4000-8000-000000000001');
  await page.getByLabel(/^Quantity/).fill('2');
  await page.getByLabel('Price per unit (USD)').fill('100');
  await page.getByRole('button',{name:'Record transaction',exact:true}).click();
  await expect(page.getByText('A sale exceeds the holding available at its transaction date.')).toBeVisible();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Add transaction',exact:true}).first().click();
  await page.getByLabel('Amount (USD)').fill('500');
  await page.getByRole('button',{name:'Record transaction',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.value-card').filter({hasText:'Cash balance'}).getByText('$500.00',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Reverse buy transaction'}).click();
  await page.getByRole('button',{name:'Reverse transaction',exact:true}).click();
  await expect(page.getByText('No holdings yet',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Markets',exact:true}).click();
  await expect(page.getByText('Demo market data.',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Explore AAPL'}).click();
  await expect(page.getByRole('heading',{name:'Apple Inc.',exact:true})).toBeVisible();
  await expect(page.locator('.asset-detail').getByText('DEMO FIXTURE',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Price observations'})).toBeVisible();
  await page.getByRole('button',{name:'30D',exact:true}).click();
  await expect(page.getByRole('button',{name:'30D',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('heading',{name:'Price observations'})).toBeVisible();
  await page.getByLabel('Search assets').fill('MSFT');
  await page.getByRole('button',{name:'Search',exact:true}).click();
  await expect(page.locator('.asset-catalog-list').getByRole('link')).toHaveCount(1);
  await page.locator('.asset-catalog-list').getByRole('link').click();
  await expect(page.getByRole('heading',{name:'Microsoft Corporation',exact:true})).toBeVisible();
  await captureScreenshot(page,testInfo,'market-desktop');
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('body')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await captureScreenshot(page,testInfo,'market-mobile');
  await page.getByRole('button',{name:'Open navigation'}).click();
  await page.getByRole('link',{name:'Watchlists',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Keep your interests close.'})).toBeVisible();
  await page.setViewportSize({width:1280,height:720});
  await page.getByRole('button',{name:'New watchlist'}).click();
  await page.getByLabel('Watchlist name').fill('Demo watchlist');
  await page.getByRole('button',{name:'Create watchlist',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Demo watchlist'})).toBeVisible();
  await page.getByRole('button',{name:'Add an asset'}).click();
  await page.getByLabel('Find an asset').fill('AAPL');
  await page.getByRole('button',{name:'Add',exact:true}).click();
  await expect(page.getByRole('button',{name:'Remove AAPL from Demo watchlist'})).toBeVisible();
  await page.getByRole('button',{name:'Rename Demo watchlist'}).click();
  await page.getByLabel('Watchlist name').fill('Renamed watchlist');
  await page.getByRole('button',{name:'Save name'}).click();
  await expect(page.getByRole('heading',{name:'Renamed watchlist'})).toBeVisible();
  await captureScreenshot(page,testInfo,'watchlist-desktop');
  await captureMobile(page,testInfo,'watchlist');
  await page.getByRole('button',{name:'Remove AAPL from Renamed watchlist'}).click();
  await expect(page.getByText('Add the assets you’re curious about.')).toBeVisible();
  await page.getByRole('link',{name:'Account & security'}).click();
  await page.getByLabel('Current password',{exact:true}).fill('incorrect password');
  await page.getByLabel(/^New password/).fill('a different browser test passphrase');
  await page.getByLabel('Confirm new password',{exact:true}).fill('a different browser test passphrase');
  const reauth = page.waitForResponse(response=>response.url().endsWith('/auth/password/change') && response.request().method()==='POST');
  await page.getByRole('button',{name:'Update password'}).click();
  const rejected = await reauth;
  expect(rejected.status()).toBe(401);
  expect((await rejected.json()).error.code).toBe('REAUTH_REQUIRED');
  await expect(page.getByText('Current password is incorrect.')).toBeVisible();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByLabel('Display name').fill('Updated Demo Investor');
  await page.getByRole('button',{name:'Save profile'}).click();
  await expect(page.getByText('Your profile has been updated.')).toBeVisible();
  await captureScreenshot(page,testInfo,'settings-desktop');
  await captureMobile(page,testInfo,'settings');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email address').fill('browser@example.test');
  await page.getByLabel('Password',{exact:true}).fill('incorrect password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
  await page.getByLabel('Password',{exact:true}).fill('local browser testing passphrase');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();
  await captureScreenshot(page,testInfo,'overview-desktop');
  await captureMobile(page,testInfo,'overview');
  await page.getByRole('link',{name:'Account & security'}).click();
  await page.getByRole('button',{name:'Revoke',exact:true}).click();
  await page.getByRole('button',{name:'Revoke session',exact:true}).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/watchlists');
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});
