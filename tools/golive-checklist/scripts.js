/* eslint-disable no-console */
import { ensureLogin } from '../../blocks/profile/profile.js';
import { initConfigField, updateConfig } from '../../utils/config/config.js';

// Form elements
const FORM = document.getElementById('checklist-form');
const ORG_FIELD = document.getElementById('org');
const SITE_FIELD = document.getElementById('site');
const DOMAIN_FIELD = document.getElementById('domain');
const RESULTS = document.getElementById('checklist-results');

// Utility functions
/**
 * Updates the status of a checklist item
 * @param {string} itemId - ID of the checklist item
 * @param {string} status - Status: 'pass', 'fail', 'warning', 'pending', 'manual'
 * @param {string} message - Message to display
 */
function updateChecklistItem(itemId, status, message) {
  const item = document.getElementById(itemId);
  if (!item) return;

  const statusIcon = item.querySelector('.status-icon');
  const statusBadge = item.querySelector('.status-badge');
  const resultDiv = item.querySelector('.check-result');

  // Update status icon
  const icons = {
    pass: '✅',
    fail: '❌',
    warning: '⚠️',
    pending: '⏳',
    manual: '⚠️',
  };
  statusIcon.textContent = icons[status] || '⏳';

  // Update status badge
  const badges = {
    pass: 'Pass',
    fail: 'Fail',
    warning: 'Warning',
    pending: 'Pending',
    manual: 'Manual Check',
  };
  statusBadge.textContent = badges[status] || 'Pending';
  statusBadge.className = `status-badge ${status}`;

  // Update item status
  item.className = `checklist-item ${status}`;

  // Update result message
  if (resultDiv && message) {
    resultDiv.innerHTML = message;
  }
}

/**
 * Shows loading state for button
 * @param {HTMLButtonElement} button - Button element
 */
function showLoadingButton(button) {
  button.disabled = true;
  const { width, height } = button.getBoundingClientRect();
  button.style.minWidth = `${width}px`;
  button.style.minHeight = `${height}px`;
  button.dataset.label = button.textContent || 'Submit';
  button.innerHTML = '<i class="symbol symbol-loading"></i>';
}

/**
 * Resets button from loading state
 * @param {HTMLButtonElement} button - Button element
 */
function resetLoadingButton(button) {
  button.textContent = button.dataset.label;
  button.removeAttribute('style');
  button.disabled = false;
}

/**
 * Gets form data as an object
 * @param {HTMLFormElement} form - Form element
 * @returns {Object} Form data
 */
function getFormData(form) {
  const data = {};
  [...form.elements].forEach((field) => {
    const { name, type, value } = field;
    if (name && value) {
      data[name] = value;
    }
  });
  return data;
}

/**
 * Checks if RUM is enabled for the site
 * @param {string} org - Organization name
 * @param {string} site - Site name
 * @returns {Promise<{status: string, message: string}>}
 */
async function checkRUM(org, site) {
  try {
    // Check if RUM script is present on the site
    const liveUrl = `https://main--${site}--${org}.aem.live/`;
    const response = await fetch(liveUrl);
    const html = await response.text();
    
    const hasRUM = html.includes('/.rum/') || html.includes('rum.js');
    
    if (hasRUM) {
      return {
        status: 'pass',
        message: `<p>✅ RUM is instrumented on the site.</p>
          <p><a href="/tools/rum/explorer.html?domainkey=${org}--${site}" target="_blank">View RUM Dashboard</a></p>`,
      };
    }
    return {
      status: 'warning',
      message: '<p>⚠️ RUM instrumentation not detected. Consider adding RUM to track performance metrics.</p>',
    };
  } catch (error) {
    return {
      status: 'warning',
      message: `<p>⚠️ Unable to verify RUM instrumentation: ${error.message}</p>`,
    };
  }
}

/**
 * Checks for redirects configuration
 * @param {string} org - Organization name
 * @param {string} site - Site name
 * @returns {Promise<{status: string, message: string}>}
 */
async function checkRedirects(org, site) {
  try {
    // Check if redirects are configured via admin API
    const url = `https://admin.hlx.page/config/${org}/sites/${site}.json`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return {
        status: 'warning',
        message: '<p>⚠️ Unable to verify redirects configuration via admin API.</p>',
      };
    }

    const config = await response.json();
    const hasRedirects = config.redirects || (config.data && config.data.redirects);
    
    if (hasRedirects) {
      return {
        status: 'pass',
        message: '<p>✅ Redirects configuration found.</p><p>See <a href="https://www.aem.live/docs/redirects" target="_blank">Redirects documentation</a> for more information.</p>',
      };
    }
    
    return {
      status: 'warning',
      message: '<p>⚠️ No redirects configuration found. Consider creating a redirects.xlsx file if you have legacy URLs to redirect.</p>',
    };
  } catch (error) {
    return {
      status: 'warning',
      message: `<p>⚠️ Unable to verify redirects configuration: ${error.message}</p>`,
    };
  }
}

/**
 * Checks for sitemap
 * @param {string} org - Organization name
 * @param {string} site - Site name
 * @param {string} domain - Optional production domain
 * @returns {Promise<{status: string, message: string}>}
 */
async function checkSitemap(org, site, domain) {
  try {
    const baseUrl = domain || `main--${site}--${org}.aem.live`;
    const sitemapUrl = `https://${baseUrl}/sitemap.xml`;
    
    const response = await fetch(sitemapUrl);
    
    if (response.ok) {
      const text = await response.text();
      const isValidSitemap = text.includes('<?xml') && text.includes('urlset');
      
      if (isValidSitemap) {
        return {
          status: 'pass',
          message: `<p>✅ Sitemap is accessible at <a href="${sitemapUrl}" target="_blank">${sitemapUrl}</a></p>`,
        };
      }
    }
    
    return {
      status: 'warning',
      message: `<p>⚠️ Sitemap not found at <a href="${sitemapUrl}" target="_blank">${sitemapUrl}</a></p>
        <p>See <a href="https://www.aem.live/docs/sitemap" target="_blank">Sitemap documentation</a> for setup instructions.</p>`,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: `<p>❌ Error checking sitemap: ${error.message}</p>`,
    };
  }
}

/**
 * Checks robots.txt
 * @param {string} org - Organization name
 * @param {string} site - Site name
 * @param {string} domain - Optional production domain
 * @returns {Promise<{status: string, message: string}>}
 */
async function checkRobots(org, site, domain) {
  try {
    const baseUrl = domain || `main--${site}--${org}.aem.live`;
    const robotsUrl = `https://${baseUrl}/robots.txt`;
    
    const response = await fetch(robotsUrl);
    
    if (response.ok) {
      const text = await response.text();
      const allowsCrawlers = text.includes('User-agent:') && text.includes('Allow:');
      const hasSitemap = text.toLowerCase().includes('sitemap:');
      
      let status = 'pass';
      let messages = ['<p>✅ robots.txt is accessible.</p>'];
      
      if (!allowsCrawlers) {
        status = 'warning';
        messages.push('<p>⚠️ robots.txt may not be properly configured to allow crawlers.</p>');
      }
      
      if (!hasSitemap) {
        status = 'warning';
        messages.push('<p>⚠️ robots.txt does not reference sitemap.xml</p>');
      }
      
      messages.push(`<p><a href="${robotsUrl}" target="_blank">View robots.txt</a></p>`);
      
      return {
        status,
        message: messages.join(''),
      };
    }
    
    return {
      status: 'warning',
      message: `<p>⚠️ robots.txt not found at <a href="${robotsUrl}" target="_blank">${robotsUrl}</a></p>
        <p>See <a href="https://www.aem.live/docs/indexing#robots-txt" target="_blank">robots.txt documentation</a>.</p>`,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: `<p>❌ Error checking robots.txt: ${error.message}</p>`,
    };
  }
}

/**
 * Checks canonical URLs
 * @param {string} org - Organization name
 * @param {string} site - Site name
 * @param {string} domain - Optional production domain
 * @returns {Promise<{status: string, message: string}>}
 */
async function checkCanonical(org, site, domain) {
  try {
    const baseUrl = domain || `main--${site}--${org}.aem.live`;
    const testUrl = `https://${baseUrl}/`;
    
    const response = await fetch(testUrl);
    
    if (response.ok && response.status >= 200 && response.status < 300) {
      const html = await response.text();
      const hasCanonical = html.includes('<link rel="canonical"');
      
      if (hasCanonical) {
        return {
          status: 'pass',
          message: '<p>✅ Canonical URL found and homepage returns 2xx status.</p><p>Verify all pages have proper canonical tags.</p>',
        };
      }
      
      return {
        status: 'warning',
        message: '<p>⚠️ No canonical tag found on homepage. Ensure canonical URLs are properly implemented.</p>',
      };
    }
    
    return {
      status: 'fail',
      message: `<p>❌ Homepage returned non-2xx status: ${response.status}</p>`,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: `<p>❌ Error checking canonical URLs: ${error.message}</p>`,
    };
  }
}

/**
 * Checks for favicon
 * @param {string} org - Organization name
 * @param {string} site - Site name
 * @param {string} domain - Optional production domain
 * @returns {Promise<{status: string, message: string}>}
 */
async function checkFavicon(org, site, domain) {
  try {
    const baseUrl = domain || `main--${site}--${org}.aem.live`;
    const faviconUrl = `https://${baseUrl}/favicon.ico`;
    
    const response = await fetch(faviconUrl, { method: 'HEAD' });
    
    if (response.ok) {
      return {
        status: 'pass',
        message: `<p>✅ Favicon is configured at <a href="${faviconUrl}" target="_blank">${faviconUrl}</a></p>`,
      };
    }
    
    return {
      status: 'warning',
      message: `<p>⚠️ Favicon not found at ${faviconUrl}</p>
        <p>See <a href="https://www.aem.live/docs/favicon" target="_blank">Favicon documentation</a>.</p>`,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: `<p>❌ Error checking favicon: ${error.message}</p>`,
    };
  }
}

/**
 * Checks Lighthouse score via PageSpeed Insights API
 * @param {string} org - Organization name
 * @param {string} site - Site name
 * @param {string} domain - Optional production domain
 * @returns {Promise<{status: string, message: string}>}
 */
async function checkLighthouse(org, site, domain) {
  try {
    const baseUrl = domain || `main--${site}--${org}.aem.live`;
    const testUrl = `https://${baseUrl}/`;
    
    // Note: This is a simplified check. In production, you'd want to use the PageSpeed Insights API
    // For now, we'll just provide a link to test manually
    const psiUrl = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(testUrl)}`;
    
    return {
      status: 'warning',
      message: `<p>⚠️ Lighthouse score should be validated manually.</p>
        <p>Test your site with <a href="${psiUrl}" target="_blank">Google PageSpeed Insights</a></p>
        <p>Target: Score of 100 for both mobile and desktop</p>`,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: `<p>❌ Error preparing Lighthouse check: ${error.message}</p>`,
    };
  }
}

/**
 * Checks CDN configuration
 * @param {string} org - Organization name
 * @param {string} site - Site name
 * @param {string} domain - Optional production domain
 * @returns {Promise<{status: string, message: string}>}
 */
async function checkCDN(org, site, domain) {
  if (!domain) {
    return {
      status: 'warning',
      message: '<p>⚠️ Enter a production domain to check CDN configuration.</p>',
    };
  }

  try {
    // Check if domain is accessible
    const response = await fetch(`https://${domain}/`, { method: 'HEAD' });
    
    if (response.ok) {
      return {
        status: 'pass',
        message: `<p>✅ Production domain is accessible.</p>
          <p>Use the <a href="/tools/push-invalidation">Push Invalidation tool</a> to validate CDN setup.</p>
          <p>See <a href="https://www.aem.live/docs/byo-cdn-setup" target="_blank">BYO CDN Setup</a> documentation.</p>`,
      };
    }
    
    return {
      status: 'warning',
      message: `<p>⚠️ Production domain returned status ${response.status}</p>`,
    };
  } catch (error) {
    return {
      status: 'warning',
      message: `<p>⚠️ Unable to access production domain: ${error.message}</p>
        <p>This may be expected if CDN is not yet configured.</p>`,
    };
  }
}

/**
 * Runs all automated checks
 * @param {string} org - Organization name
 * @param {string} site - Site name
 * @param {string} domain - Optional production domain
 */
async function runChecklist(org, site, domain) {
  // Show results section
  RESULTS.setAttribute('aria-hidden', false);

  // Reset all automated checks to pending
  const automatedChecks = [
    'check-lighthouse',
    'check-rum',
    'check-redirects',
    'check-sitemap',
    'check-robots',
    'check-canonical',
    'check-favicon',
    'check-cdn',
  ];

  automatedChecks.forEach((checkId) => {
    updateChecklistItem(checkId, 'pending', '<p>Checking...</p>');
  });

  // Run checks
  const checks = [
    { id: 'check-lighthouse', fn: checkLighthouse },
    { id: 'check-rum', fn: checkRUM },
    { id: 'check-redirects', fn: checkRedirects },
    { id: 'check-sitemap', fn: checkSitemap },
    { id: 'check-robots', fn: checkRobots },
    { id: 'check-canonical', fn: checkCanonical },
    { id: 'check-favicon', fn: checkFavicon },
    { id: 'check-cdn', fn: checkCDN },
  ];

  // Run all checks in parallel
  await Promise.all(
    checks.map(async ({ id, fn }) => {
      try {
        const result = await fn(org, site, domain);
        updateChecklistItem(id, result.status, result.message);
      } catch (error) {
        updateChecklistItem(id, 'fail', `<p>❌ Error: ${error.message}</p>`);
      }
    }),
  );
}

/**
 * Checks if user is logged in
 * @returns {Promise<boolean>}
 */
async function isLoggedIn() {
  const org = ORG_FIELD.value;
  const site = SITE_FIELD.value;
  if (org && site) {
    return ensureLogin(org, site);
  }
  return false;
}

/**
 * Registers event listeners
 */
async function registerListeners() {
  // Handle form submission
  FORM.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!await isLoggedIn()) {
      window.addEventListener('profile-update', ({ detail: loginInfo }) => {
        if (loginInfo.includes(ORG_FIELD.value)) {
          FORM.querySelector('button[type="submit"]').click();
        }
      }, { once: true });
      return;
    }

    const { target, submitter } = e;
    showLoadingButton(submitter);

    const data = getFormData(target);
    const { org, site, domain } = data;

    if (org && site) {
      await runChecklist(org, site, domain);
      updateConfig();
    }

    resetLoadingButton(submitter);
  });

  // Handle form reset
  FORM.addEventListener('reset', () => {
    RESULTS.setAttribute('aria-hidden', true);
  });

  // Initialize config field (for org/site autocomplete)
  await initConfigField();
}

// Initialize
registerListeners();

