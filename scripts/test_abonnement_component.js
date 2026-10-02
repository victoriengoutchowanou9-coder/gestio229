import { createClient } from '@supabase/supabase-js';
import { getCompanySubscriptionInfo, calculateSubscriptionPrice, formatFCFA, STARTER_ACCESSIBLE_MODULES, ADVANCED_MODULES } from '../src/core/subscription/subscriptionEngine.js';

const SUPABASE_URL = 'https://inknljnhqmrykcrgglts.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testAbonnementLogic() {
  console.log('Testing AbonnementPage logic for all companies in Supabase...');

  const { data: companies, error } = await supabase.from('companies').select('*');
  if (error) {
    console.error('Error loading companies:', error);
    return;
  }

  for (const company of companies) {
    console.log(`\n--- Company: ${company.name} (${company.id}) ---`);
    try {
      const subInfo = getCompanySubscriptionInfo(company);
      console.log('subInfo:', {
        isTrial: subInfo.isTrial,
        isActive: subInfo.isActive,
        isExpired: subInfo.isExpired,
        isSuspended: subInfo.isSuspended,
        statusLabel: subInfo.statusLabel,
        startDate: subInfo.startDate,
        endDate: subInfo.endDate,
        daysRemaining: subInfo.daysRemaining,
        planName: subInfo.planName,
        planSlug: subInfo.planSlug,
        activityCount: subInfo.activityCount,
        futurePrice: subInfo.futurePrice,
      });

      // Test interactive activities state
      const interactiveActivities = subInfo.activityCount > 3 ? subInfo.activityCount : 4;
      console.log('interactiveActivities:', interactiveActivities);

      // Test selected plan slug
      const selectedPlanSlug = subInfo.planSlug.includes('starter') ? 'starter' : 'entreprise';
      console.log('selectedPlanSlug:', selectedPlanSlug);

      // Test multi plan calculation
      const multiPlanCalculated = calculateSubscriptionPrice(interactiveActivities);
      console.log('multiPlanCalculated:', multiPlanCalculated.name, multiPlanCalculated.priceMonthly);

      // Test modal opening
      const renewPlan = calculateSubscriptionPrice(
        subInfo.activityCount,
        subInfo.planSlug.includes('starter') ? 'starter' : 'entreprise'
      );
      console.log('renewPlan:', renewPlan.name, renewPlan.priceMonthly);

      // Test price format
      console.log('formatted price:', formatFCFA(renewPlan.priceMonthly));

      // Test query subscription_payments
      const { data: payments, error: payError } = await supabase
        .from('subscription_payments')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false })
        .limit(10);

      console.log('payments query result:', payError ? `Error: ${payError.message}` : `Found ${payments?.length} payments`);

      console.log('=> RESULT: All calculations SUCCESSFUL without throwing error.');
    } catch (err) {
      console.error('CRASH in company logic:', err);
    }
  }

  // Also test with company = null (during hydration or when user has no company)
  console.log('\n--- Testing with company = null ---');
  try {
    const subInfoNull = getCompanySubscriptionInfo(null);
    console.log('subInfoNull:', subInfoNull);
    console.log('selectedPlanSlug:', subInfoNull.planSlug.includes('starter') ? 'starter' : 'entreprise');
    console.log('=> RESULT: company = null SUCCESSFUL.');
  } catch (err) {
    console.error('CRASH with company = null:', err);
  }

  // Also test with company = {} (empty object)
  console.log('\n--- Testing with company = {} ---');
  try {
    const subInfoEmpty = getCompanySubscriptionInfo({});
    console.log('subInfoEmpty:', subInfoEmpty);
    console.log('selectedPlanSlug:', subInfoEmpty.planSlug.includes('starter') ? 'starter' : 'entreprise');
    console.log('=> RESULT: company = {} SUCCESSFUL.');
  } catch (err) {
    console.error('CRASH with company = {}:', err);
  }
}

testAbonnementLogic();
