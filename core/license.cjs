/**
 * license.cjs — License Validation for Nelson Knowledge Engine v6
 *
 * Validates license keys locally with optional remote validation.
 * Supports offline mode with cached validation (7-day grace period).
 *
 * License key format: KE6-XXXX-XXXX-XXXX-XXXX (20 chars after prefix)
 * Keys are validated against a simple checksum for offline use,
 * and optionally verified against a remote license server.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LICENSE_PREFIX = 'KE6';
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// ---------------------------------------------------------------------------
// LicenseManager Class
// ---------------------------------------------------------------------------

class LicenseManager {
  /**
   * @param {string} dataDir - Path to plugin data directory
   * @param {Object} [opts]
   * @param {string} [opts.serverUrl] - License server URL (optional)
   */
  constructor(dataDir, opts = {}) {
    this.dataDir = dataDir;
    this.licensePath = path.join(dataDir, 'license.json');
    this.serverUrl = opts.serverUrl || null;
    this._cache = null;
  }

  /**
   * Get current license status.
   *
   * @returns {{ valid: boolean, tier: string, reason: string, daysRemaining: number|null, key: string|null }}
   */
  getStatus() {
    const data = this._readLicenseFile();

    // No license file — check trial
    if (!data || !data.key) {
      return this._checkTrial(data);
    }

    // Has a key — validate it
    if (!this._validateKeyFormat(data.key)) {
      return { valid: false, tier: 'none', reason: 'Invalid license key format', daysRemaining: null, key: data.key };
    }

    // Check cached remote validation
    if (data.validated_at) {
      const age = Date.now() - new Date(data.validated_at).getTime();
      if (age < CACHE_DURATION_MS) {
        return {
          valid: true,
          tier: data.tier || 'solo',
          reason: 'License valid (cached)',
          daysRemaining: data.expires ? Math.ceil((new Date(data.expires).getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null,
          key: data.key,
        };
      }
    }

    // Offline validation (key format + checksum)
    if (this._validateKeyChecksum(data.key)) {
      return {
        valid: true,
        tier: data.tier || 'solo',
        reason: 'License valid (offline)',
        daysRemaining: null,
        key: data.key,
      };
    }

    return { valid: false, tier: 'none', reason: 'License key failed validation', daysRemaining: null, key: data.key };
  }

  /**
   * Activate a license key.
   *
   * @param {string} key - License key to activate
   * @returns {{ success: boolean, message: string }}
   */
  activate(key) {
    if (!this._validateKeyFormat(key)) {
      return { success: false, message: 'Invalid key format. Expected: KE6-XXXX-XXXX-XXXX-XXXX' };
    }

    if (!this._validateKeyChecksum(key)) {
      return { success: false, message: 'Invalid license key' };
    }

    const data = {
      key,
      tier: 'solo',
      activated_at: new Date().toISOString(),
      validated_at: new Date().toISOString(),
      machine_id: this._getMachineId(),
    };

    this._writeLicenseFile(data);
    return { success: true, message: `License activated! Tier: solo` };
  }

  /**
   * Start or check trial status.
   *
   * @returns {{ active: boolean, daysRemaining: number }}
   */
  startTrial() {
    let data = this._readLicenseFile();

    if (!data) {
      data = {
        trial_started: new Date().toISOString(),
      };
      this._writeLicenseFile(data);
    }

    if (!data.trial_started) {
      data.trial_started = new Date().toISOString();
      this._writeLicenseFile(data);
    }

    const elapsed = Date.now() - new Date(data.trial_started).getTime();
    const remaining = Math.max(0, Math.ceil((TRIAL_DURATION_MS - elapsed) / (24 * 60 * 60 * 1000)));

    return { active: remaining > 0, daysRemaining: remaining };
  }

  /**
   * Check if the engine should run in read-only mode.
   * Read-only when: trial expired AND no valid license.
   *
   * @returns {boolean}
   */
  isReadOnly() {
    const status = this.getStatus();
    return !status.valid;
  }

  // -------------------------------------------------------------------------
  // Private methods
  // -------------------------------------------------------------------------

  _checkTrial(data) {
    if (!data || !data.trial_started) {
      // First run — start trial
      const trial = this.startTrial();
      return {
        valid: true,
        tier: 'trial',
        reason: `Trial started (${trial.daysRemaining} days remaining)`,
        daysRemaining: trial.daysRemaining,
        key: null,
      };
    }

    const elapsed = Date.now() - new Date(data.trial_started).getTime();
    const remaining = Math.max(0, Math.ceil((TRIAL_DURATION_MS - elapsed) / (24 * 60 * 60 * 1000)));

    if (remaining > 0) {
      return {
        valid: true,
        tier: 'trial',
        reason: `Trial active (${remaining} days remaining)`,
        daysRemaining: remaining,
        key: null,
      };
    }

    return {
      valid: false,
      tier: 'expired',
      reason: 'Trial expired. Activate a license with /zed:activate',
      daysRemaining: 0,
      key: null,
    };
  }

  /**
   * Validate key format: KE6-XXXX-XXXX-XXXX-XXXX
   * @private
   */
  _validateKeyFormat(key) {
    return /^KE6-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
  }

  /**
   * Validate key checksum (last 4 chars are derived from first 12).
   * This provides basic offline validation without a server.
   * @private
   */
  _validateKeyChecksum(key) {
    const parts = key.split('-');
    if (parts.length !== 5) return false;

    const payload = parts.slice(1, 4).join('');
    const checksum = parts[4];
    const expected = crypto
      .createHash('sha256')
      .update(`${LICENSE_PREFIX}-${payload}-nelson-v6`)
      .digest('hex')
      .slice(0, 4)
      .toUpperCase();

    return checksum === expected;
  }

  /**
   * Generate a machine-specific identifier.
   * @private
   */
  _getMachineId() {
    const os = require('os');
    const data = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.userInfo().username}`;
    return crypto.createHash('sha256').update(data).digest('hex').slice(0, 16);
  }

  _readLicenseFile() {
    try {
      if (!fs.existsSync(this.licensePath)) return null;
      return JSON.parse(fs.readFileSync(this.licensePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  _writeLicenseFile(data) {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    fs.writeFileSync(this.licensePath, JSON.stringify(data, null, 2), 'utf-8');
    this._cache = data;
  }
}

/**
 * Generate a valid license key (for admin/testing use).
 *
 * @returns {string} A valid KE6-XXXX-XXXX-XXXX-XXXX license key
 */
function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const randomBlock = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

  const b1 = randomBlock();
  const b2 = randomBlock();
  const b3 = randomBlock();
  const payload = `${b1}${b2}${b3}`;
  const checksum = crypto
    .createHash('sha256')
    .update(`${LICENSE_PREFIX}-${payload}-nelson-v6`)
    .digest('hex')
    .slice(0, 4)
    .toUpperCase();

  return `${LICENSE_PREFIX}-${b1}-${b2}-${b3}-${checksum}`;
}

module.exports = { LicenseManager, generateLicenseKey };
