import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { StorageEngine, ensureUuid } from '../src/server/storage.js';

async function runTests() {
  console.log('====================================================');
  console.log('STUDY FOX PRODUCTION PERSISTENCE VERIFICATION SUITE');
  console.log('====================================================');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL or SERVICE_ROLE_KEY missing from environment!');
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const storage = StorageEngine.getInstance();
  console.log('[1/8] Rehydrating storage from live Supabase...');
  await storage.rehydrateFromSupabase(supabaseUrl, supabaseKey);

  // Test 1: Super Admin Preservation
  console.log('\n--- TEST 1: Super Admin Security Check ---');
  const superAdmin = storage.getUserByEmail('bhaskardattmishra0101@gmail.com');
  if (!superAdmin) throw new Error('Super Admin bhaskardattmishra0101@gmail.com not found!');
  if (superAdmin.role !== 'super_admin') throw new Error(`Super Admin role mismatch: ${superAdmin.role}`);
  console.log('✓ PASS: Super Admin email bhaskardattmishra0101@gmail.com strictly preserved with role "super_admin".');

  // Test 2: Verify Supabase tables row counts
  console.log('\n--- TEST 2: Authoritative Supabase Database State ---');
  const tables = ['platforms', 'vip_plans', 'vip_batches', 'app_users', 'app_settings', 'announcements'];
  for (const tbl of tables) {
    const { count, error } = await supabase.from(tbl).select('*', { count: 'exact', head: true });
    if (error) throw new Error(`Supabase error reading ${tbl}: ${error.message}`);
    console.log(`✓ Table ${tbl}: ${count} rows confirmed in live Supabase.`);
  }

  // Test 3: Platform Persistence Roundtrip
  console.log('\n--- TEST 3: Platform Persistence Roundtrip (P1) ---');
  const platforms = storage.getPlatforms();
  if (platforms.length === 0) throw new Error('No platforms found in database!');
  const testPlat = platforms[0];
  const originalUrl = testPlat.target_url;
  const updatedUrl = `https://test-verify.studyfox.internal/${Date.now()}`;

  console.log(`Updating platform "${testPlat.name}" (${testPlat.id}) target_url to: ${updatedUrl}`);
  const updatedPlat = await storage.updatePlatform(testPlat.id, { target_url: updatedUrl });
  if (!updatedPlat || updatedPlat.target_url !== updatedUrl) {
    throw new Error('Local update failed!');
  }

  // Check directly in Supabase
  const platUuid = ensureUuid(testPlat.id);
  const { data: remotePlat, error: remotePlatErr } = await supabase
    .from('platforms')
    .select('*')
    .or(`id.eq.${testPlat.id},id.eq.${platUuid}`)
    .single();

  if (remotePlatErr || !remotePlat) {
    throw new Error(`Failed to query updated platform in Supabase: ${remotePlatErr?.message}`);
  }
  if (remotePlat.target_url !== updatedUrl) {
    throw new Error(`Supabase target_url mismatch! Expected ${updatedUrl}, got ${remotePlat.target_url}`);
  }
  console.log('✓ PASS: Platform update written and verified directly in live Supabase.');

  // Restore original URL
  await storage.updatePlatform(testPlat.id, { target_url: originalUrl });
  console.log(`✓ Restored platform original URL to: ${originalUrl}`);

  // Test 4: VIP Plan Persistence Roundtrip (P2)
  console.log('\n--- TEST 4: VIP Plan Persistence Roundtrip (P2) ---');
  const plans = storage.getVipPlans();
  if (plans.length === 0) throw new Error('No VIP plans found in database!');
  const testPlan = plans[0];
  const origPrice = testPlan.price_inr;
  const newPrice = origPrice + 1;
  const origDays = testPlan.duration_days;
  const newDays = origDays === 365 ? 366 : 365;

  console.log(`Updating VIP plan "${testPlan.title}" price to ₹${newPrice} and duration to ${newDays} days...`);
  const updatedPlan = await storage.updateVipPlan(testPlan.id, { price_inr: newPrice, duration_days: newDays });
  if (!updatedPlan || updatedPlan.price_inr !== newPrice) {
    throw new Error('Local VIP plan update failed!');
  }

  // Check directly in Supabase
  const planUuid = ensureUuid(testPlan.id);
  const { data: remotePlan, error: remotePlanErr } = await supabase
    .from('vip_plans')
    .select('*')
    .or(`id.eq.${testPlan.id},id.eq.${planUuid}`)
    .single();

  if (remotePlanErr || !remotePlan) {
    throw new Error(`Failed to query updated VIP plan in Supabase: ${remotePlanErr?.message}`);
  }
  if (Number(remotePlan.price_inr) !== newPrice || remotePlan.duration_days !== newDays) {
    throw new Error(`Supabase VIP plan mismatch! Price: ${remotePlan.price_inr}, Days: ${remotePlan.duration_days}`);
  }
  console.log('✓ PASS: VIP plan price & duration update verified in live Supabase.');

  // Restore VIP plan
  await storage.updateVipPlan(testPlan.id, { price_inr: origPrice, duration_days: origDays });
  console.log(`✓ Restored VIP plan to original ₹${origPrice} and ${origDays} days.`);

  // Test 5: Demo Data Removal Check (P3)
  console.log('\n--- TEST 5: Demo Data Deletion & Non-Regeneration (P3) ---');
  const allUsers = storage.getUsers();
  const demoEmails = ['student@education.com', 'admin@education.com', 'vipstudent@education.com', 'superadmin@education.com'];
  for (const de of demoEmails) {
    const found = allUsers.find((u) => u.email.toLowerCase() === de);
    if (found) throw new Error(`Deleted demo account "${de}" was resurrected in storage!`);
  }
  console.log('✓ PASS: Zero demo accounts resurrected. Only real users present.');

  // Test 6: Login Audit History Recording (P4)
  console.log('\n--- TEST 6: Login Audit History (P4) ---');
  const auditEmail = 'bhaskardattmishra0101@gmail.com';
  const testIp = '127.0.0.1';
  const testUa = 'Automated Verification Agent';
  const logged = await storage.recordLogin({
    user_id: superAdmin.id,
    email: auditEmail,
    ip_address: testIp,
    user_agent: testUa,
    status: 'success',
  });
  console.log(`Recorded login entry ID: ${logged.id}`);

  // Query live Supabase
  const { data: remoteLogin, error: rlErr } = await supabase
    .from('login_history')
    .select('*')
    .eq('id', logged.id)
    .single();

  if (rlErr || !remoteLogin) {
    throw new Error(`Login history entry not found in Supabase: ${rlErr?.message}`);
  }
  console.log(`✓ PASS: Login audit event persisted in Supabase login_history (Timestamp: ${remoteLogin.timestamp}).`);

  // Clean up test entry
  await storage.deleteLoginHistoryEntry(logged.id);
  console.log('✓ Cleaned up test audit entry.');

  // Test 7: Key Generation, Verification & Activation State Machine (P5 & P6)
  console.log('\n--- TEST 7: Key Verification & Home Access Activation (P5 & P6) ---');
  // Create pending verification
  const pending = storage.createPendingKeyVerification(superAdmin.id, superAdmin.email);
  console.log(`Created pending key verification token: ${pending.token.substring(0, 12)}...`);

  // Activate via tokenless flow (static shortener simulation)
  const actResult = await storage.verifyAndActivateKey(superAdmin.id);
  if (!actResult.success || !actResult.key_record) {
    throw new Error(`Tokenless key activation failed: ${actResult.error}`);
  }
  console.log(`Key activated successfully! Key record ID: ${actResult.key_record.id}`);

  // Check Supabase key_records
  const { data: remoteKey, error: rkErr } = await supabase
    .from('key_records')
    .select('*')
    .eq('id', actResult.key_record.id)
    .single();

  if (rkErr || !remoteKey) {
    throw new Error(`Key record not found in Supabase: ${rkErr?.message}`);
  }
  console.log(`✓ PASS: Key record persisted in live Supabase key_records table.`);

  // Test replay protection
  const replayAttempt = await storage.verifyAndActivateKey(superAdmin.id, pending.token);
  if (replayAttempt.success) {
    throw new Error('Replay protection failed! Token was consumed twice!');
  }
  console.log(`✓ PASS: Replay protection confirmed (attempt rejected: "${replayAttempt.error}").`);

  // Clean up test key
  await storage.deleteKeyRecord(actResult.key_record.id);
  console.log('✓ Cleaned up test key record.');

  console.log('\n====================================================');
  console.log('ALL VERIFICATION CHECKS PASSED WITH 100% SUCCESS!');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
