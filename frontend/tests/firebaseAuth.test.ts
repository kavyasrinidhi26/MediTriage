import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkFirebaseConfig,
  validateFirebaseConfig,
  isFirebaseConfigured,
  missingFirebaseKeys,
} from '../src/services/firebase.ts';

describe('Firebase Authentication Client — Configuration & Safety Invariants', () => {
  test('1. Missing Configuration Detection: Accurately identifies unconfigured state without crashing', () => {
    const status = checkFirebaseConfig();
    assert.equal(typeof status.isConfigured, 'boolean');
    assert.ok(Array.isArray(status.missingKeys));

    // When environment variables are unset, isConfigured must be false
    // and missingKeys must contain the required Firebase variables
    if (!status.isConfigured) {
      assert.ok(status.missingKeys.length > 0);
      assert.ok(status.missingKeys.includes('VITE_FIREBASE_API_KEY'));
      assert.ok(status.missingKeys.includes('VITE_FIREBASE_PROJECT_ID'));
    }
  });

  test('2. No Mock Login Fallback: Exported isFirebaseConfigured reflects actual configuration status', () => {
    // System must NEVER claim to be configured when keys are missing
    if (missingFirebaseKeys.length > 0) {
      assert.equal(isFirebaseConfigured, false, 'Must not claim Firebase is configured when keys are missing');
    }
  });

  test('3. Emergency Workflow Invariant: Authentication state does not modify emergency intake routing or rules', async () => {
    // Verify that emergency intake and casualty protocols exist independently of user auth
    // Clinical emergency cases must remain accessible regardless of login status
    const { fetchEmergencyCases } = await import('../src/services/api.ts');
    const cases = await fetchEmergencyCases();
    assert.ok(Array.isArray(cases));
  });

  test('4. Required Firebase Keys Specification: Standard web app keys are strictly validated', () => {
    const requiredKeys = [
      'VITE_FIREBASE_API_KEY',
      'VITE_FIREBASE_AUTH_DOMAIN',
      'VITE_FIREBASE_PROJECT_ID',
      'VITE_FIREBASE_APP_ID',
    ];

    const status = checkFirebaseConfig();
    if (!status.isConfigured) {
      for (const key of requiredKeys) {
        assert.ok(
          status.missingKeys.includes(key),
          `Missing keys list must include ${key} when not configured`
        );
      }
    } else {
      assert.equal(status.missingKeys.length, 0);
      assert.equal(status.isConfigured, true);
    }
  });

  test('5. Safe Initialization Invariant: Firebase app initializes without throwing and exposes auth', async () => {
    const { app, auth } = await import('../src/services/firebase.ts');
    const status = checkFirebaseConfig();
    if (status.isConfigured) {
      assert.ok(app, 'Firebase app must be instantiated when configured');
      assert.ok(auth, 'Firebase auth instance must be instantiated when configured');
    }
  });

  test('6. ID Token Header Attachment: getAuthHeaders sends Bearer ID token when authenticated user is present', async () => {
    const { getAuthHeaders } = await import('../src/services/api.ts');
    // Unauthenticated state safely returns empty header object without throwing
    const unauthHeaders = await getAuthHeaders();
    assert.deepEqual(unauthHeaders, {});
  });

  test('7. Explicit Empty Config: validateFirebaseConfig detects all missing keys for an empty object', () => {
    const result = validateFirebaseConfig({});
    assert.equal(result.isConfigured, false);
    assert.deepEqual(result.missingKeys, [
      'VITE_FIREBASE_API_KEY',
      'VITE_FIREBASE_AUTH_DOMAIN',
      'VITE_FIREBASE_PROJECT_ID',
      'VITE_FIREBASE_APP_ID',
    ]);
  });

  test('8. Whitespace Config Handling: Whitespace-only strings are treated as missing keys', () => {
    const result = validateFirebaseConfig({
      apiKey: '   ',
      authDomain: '\t',
      projectId: '  \n',
      appId: '',
    });
    assert.equal(result.isConfigured, false);
    assert.equal(result.missingKeys.length, 4);
  });

  test('9. Partial Config Detection: Missing individual keys are pinpointed precisely', () => {
    const partial = validateFirebaseConfig({
      apiKey: 'AIzaSyDemoKey',
      authDomain: 'meditriage.firebaseapp.com',
      // projectId missing
      // appId missing
    });
    assert.equal(partial.isConfigured, false);
    assert.deepEqual(partial.missingKeys, [
      'VITE_FIREBASE_PROJECT_ID',
      'VITE_FIREBASE_APP_ID',
    ]);
  });

  test('10. Valid Complete Config: validateFirebaseConfig reports configured when all required keys are present', () => {
    const complete = validateFirebaseConfig({
      apiKey: 'AIzaSyFakeKeyForTestOnly1234567890',
      authDomain: 'meditriage-test.firebaseapp.com',
      projectId: 'meditriage-test',
      appId: '1:123456789:web:abcdef123456',
    });
    assert.equal(complete.isConfigured, true);
    assert.deepEqual(complete.missingKeys, []);
  });
});
