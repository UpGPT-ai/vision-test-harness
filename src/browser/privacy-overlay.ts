/**
 * Privacy Overlay — replaces real user data with demo content in live browser sessions.
 *
 * Used when capturing marketing screenshots from real Chrome sessions.
 * Overlays sender names, email subjects, snippets, and profile info with
 * configurable demo data so screenshots are safe to publish.
 *
 * Supports:
 *   - Gmail inbox rows (sender, subject, snippet, avatars, profile button)
 *   - Generic web apps (CSS selector-based text replacement)
 *   - Attribute sanitization (title, aria-label, email, data-hovercard-id)
 *
 * Usage in test YAML:
 *   - action: privacy_overlay
 *     preset: gmail
 *     demo_data:
 *       - { sender: "Sarah Chen", subject: "Q2 Board Meeting", snippet: "Please review..." }
 *
 *   - action: privacy_overlay
 *     rules:
 *       - { selector: ".username", text: "Demo User" }
 *       - { selector: ".email-display", text: "demo@example.com" }
 *       - { selector: ".avatar", action: "hide" }
 */

import type { Page } from 'playwright';

// ─── Preset demo data ────────────────────────────────────────────────────────

export const GMAIL_DEMO_DATA = [
  { sender: 'Sarah Chen', subject: 'Q2 Board Meeting — Agenda Attached', snippet: 'Hi team, please review the attached agenda for our Q2 board meeting on Thursday...' },
  { sender: 'Delta Air Lines', subject: 'Your Flight Confirmation #DL2847', snippet: 'Your trip from JFK to LAX is confirmed. Departure: Apr 3 at 8:15 AM...' },
  { sender: 'Stripe', subject: 'Invoice #INV-2026-0891 — Payment Received', snippet: 'We received your payment of $2,490.00 for your March invoice...' },
  { sender: 'GitHub', subject: 'Weekly Engineering Digest', snippet: '12 PRs merged, 3 issues closed, 2 new releases across your repositories...' },
  { sender: 'Figma', subject: 'Your comment was resolved', snippet: 'Alex marked your comment on "Dashboard v3" as resolved...' },
  { sender: 'Nordstrom', subject: '50% Off Spring Collection — Today Only', snippet: 'Shop the season\'s best looks at half price. Free shipping on orders over $89...' },
  { sender: 'Slack', subject: 'Sarah Chen mentioned you in #product', snippet: '"@demo can you review the mockups I posted? Need feedback by EOD..."' },
  { sender: 'Notion', subject: 'Your subscription renews tomorrow', snippet: 'Your Notion Team plan ($8/member/mo) will renew on Apr 1 for $96.00...' },
  { sender: 'DocuSign', subject: 'Contract Review — Please Sign by Friday', snippet: 'You have a document waiting for your signature: "Q2 Vendor Agreement"...' },
  { sender: 'Instacart', subject: 'Your order is on the way!', snippet: 'Your Instacart order from Whole Foods will arrive between 2:00-3:00 PM...' },
  { sender: 'LinkedIn', subject: 'Mark Tack sent you a connection request', snippet: 'Mark Tack, Board Advisor at Beeline, wants to connect with you...' },
  { sender: 'TechCrunch', subject: 'Daily — AI Funding Roundup', snippet: 'Anthropic raises $2B Series D, Perplexity hits $3B valuation, 4 more AI deals...' },
  { sender: 'AWS', subject: 'Cost Alert: Budget Exceeded', snippet: 'Your AWS account has exceeded the monthly budget of $500...' },
  { sender: 'Uber', subject: 'Your ride receipt — $24.87', snippet: 'Trip from 450 Park Ave to JFK Terminal 4. Distance: 15.2 mi...' },
  { sender: 'Amazon', subject: 'Flash Sale: 24 Hours Only', snippet: 'Deals on electronics, home, and more. Up to 70% off select items...' },
  { sender: 'Chase', subject: 'Your March statement is ready', snippet: 'Your Chase Sapphire Reserve statement for March 2026 is now available...' },
  { sender: 'Calendly', subject: '3 meetings scheduled for tomorrow', snippet: 'You have upcoming meetings: 9am Product Sync, 11am Design Review, 2pm 1:1...' },
  { sender: 'Alex Rivera', subject: 'Re: Partnership Discussion', snippet: 'Thanks for the call yesterday. The proposal looks solid, let\'s finalize...' },
  { sender: 'Morning Brew', subject: 'Your Daily Business News', snippet: 'Fed holds rates steady, Tesla deliveries miss estimates, Apple Vision Pro 2...' },
  { sender: 'Vercel', subject: 'Deploy succeeded: project/main', snippet: 'Production deployment for commit abc1234 completed in 45s. All checks passed...' },
];

export interface OverlayRule {
  /** CSS selector to find elements */
  selector: string;
  /** Text to replace with */
  text?: string;
  /** Action: 'replace' (default), 'hide', 'blur' */
  action?: 'replace' | 'hide' | 'blur';
}

export interface GmailDemoEntry {
  sender: string;
  subject: string;
  snippet: string;
}

export interface PrivacyOverlayOptions {
  /** Use a built-in preset ('gmail', 'shopify-admin', 'wordpress-admin') */
  preset?: 'gmail' | 'shopify-admin' | 'wordpress-admin' | 'generic';
  /** Custom demo data for gmail preset */
  demo_data?: GmailDemoEntry[];
  /** Custom overlay rules (for generic or additional replacements) */
  rules?: OverlayRule[];
  /** Also hide browser profile/avatar elements (default: true) */
  hide_profile?: boolean;
  /** Replace all email-like strings in attributes (default: true) */
  sanitize_attributes?: boolean;
}

/**
 * Apply privacy overlay to a live page — replaces real data with demo content.
 * This is a DOM-only operation; refreshing the page restores real data.
 */
export async function applyPrivacyOverlay(
  page: Page,
  options: PrivacyOverlayOptions = {}
): Promise<{ replaced: number; hidden: number }> {
  const preset = options.preset ?? 'generic';
  const hideProfile = options.hide_profile ?? true;
  const sanitizeAttrs = options.sanitize_attributes ?? true;

  if (preset === 'gmail') {
    return applyGmailOverlay(page, options.demo_data ?? GMAIL_DEMO_DATA, hideProfile, sanitizeAttrs);
  }

  if (preset === 'wordpress-admin') {
    return applyWordPressOverlay(page, hideProfile);
  }

  if (preset === 'shopify-admin') {
    return applyShopifyOverlay(page, hideProfile);
  }

  // Generic: apply custom rules
  if (options.rules && options.rules.length > 0) {
    return applyCustomRules(page, options.rules, sanitizeAttrs);
  }

  return { replaced: 0, hidden: 0 };
}

// ─── Gmail overlay ───────────────────────────────────────────────────────────

async function applyGmailOverlay(
  page: Page,
  demoData: GmailDemoEntry[],
  hideProfile: boolean,
  sanitizeAttrs: boolean
): Promise<{ replaced: number; hidden: number }> {
  return page.evaluate(({ data, hideProf, sanitize }) => {
    let replaced = 0;
    let hidden = 0;
    const rows = document.querySelectorAll('tr.zA, tr[role="row"]');
    let idx = 0;

    rows.forEach((row) => {
      if (idx >= data.length) return;
      const demo = data[idx];

      // ── Sender name ──
      const senderSpans = row.querySelectorAll('[email], [data-hovercard-id]');
      senderSpans.forEach((span) => {
        const textNode = span.querySelector('span, bdi') || span;
        if (textNode.textContent) {
          textNode.textContent = demo.sender;
          replaced++;
        }
        if (span.hasAttribute('email')) span.setAttribute('email', `demo${idx}@example.com`);
        if (span.hasAttribute('data-hovercard-id')) span.setAttribute('data-hovercard-id', `demo${idx}@example.com`);
        if (span.hasAttribute('name')) span.setAttribute('name', demo.sender);
      });

      // Fallback: find sender text in early td cells
      const cells = row.querySelectorAll('td');
      if (cells.length >= 3 && senderSpans.length === 0) {
        const senderCell = cells[2] || cells[1];
        if (senderCell) {
          const nameSpans = senderCell.querySelectorAll('span:not(.upinbox-sparkline):not(.upinbox-tier-dot)');
          nameSpans.forEach((ns) => {
            const text = ns.textContent?.trim() || '';
            if (text.length > 1 && text.length < 50 && !text.includes('·') &&
                (ns as HTMLElement).children.length === 0) {
              ns.textContent = demo.sender;
              replaced++;
            }
          });
        }
      }

      // ── Subject line + Snippet ──
      //
      // Gmail inbox row td layout (approximate):
      //   td[0]: checkbox
      //   td[1]: star / importance marker
      //   td[2]: sender name
      //   td[3+]: subject column — contains subject span + " - " + snippet span
      //
      // Strategy:
      //   1. Skip the first 3 tds (checkbox, star, sender).
      //   2. In remaining tds, find leaf spans (no child element nodes) with text.
      //   3. Skip label badges (≤15 chars, e.g. "Inbox", "Important") which appear
      //      before the subject span.
      //   4. First substantial span (>15 chars) = subject; second = snippet.
      //
      // This structural approach is resilient to Gmail CSS class renames (.bog, .bqe, etc.)
      // since it relies on DOM position rather than obfuscated class names.
      {
        const cells = row.querySelectorAll('td');
        // Subject column starts at td index 3 (skip checkbox, star, sender)
        const subjectCellStart = 3;
        let subjectReplaced = false;
        let snippetReplaced = false;

        for (let ci = subjectCellStart; ci < cells.length && !snippetReplaced; ci++) {
          const cell = cells[ci];
          // Collect leaf spans (no child element nodes) — these hold the visible text
          const spans = Array.from(cell.querySelectorAll('span')).filter((s) => {
            if (s.classList.contains('upinbox-sparkline') || s.classList.contains('upinbox-tier-dot')) return false;
            // Leaf span: no child ELEMENT nodes (only text nodes allowed)
            if ((s as HTMLElement).children.length > 0) return false;
            return true;
          });

          for (const s of spans) {
            const text = (s.textContent || '').trim();
            if (!text) continue;

            if (!subjectReplaced) {
              // Label badges (e.g. "Inbox", "Important") are ≤15 chars — skip them
              if (text.length <= 15) continue;
              s.textContent = demo.subject;
              subjectReplaced = true;
              replaced++;
            } else if (!snippetReplaced) {
              // The span immediately after the subject is the snippet preview.
              // Preserve the " - " separator Gmail uses between subject and snippet.
              const prefix = text.startsWith(' - ') || text.startsWith('- ') ? ' - ' : ' - ';
              s.textContent = prefix + demo.snippet;
              snippetReplaced = true;
              replaced++;
            }
          }
        }

        // Fallback: if structural approach found nothing, try legacy Gmail class selectors
        if (!subjectReplaced) {
          const legacyEls = row.querySelectorAll('.bog, .bqe, [data-thread-perm-id] span');
          if (legacyEls.length > 0) {
            (legacyEls[0] as HTMLElement).textContent = demo.subject;
            subjectReplaced = true;
            replaced++;
          } else {
            // Last resort: longest leaf span in the row
            let longest: Element | null = null;
            let longestLen = 0;
            row.querySelectorAll('td span').forEach((s) => {
              const text = s.textContent?.trim() || '';
              if (text.length > longestLen && text.length > 10 &&
                  !s.classList.contains('upinbox-sparkline') &&
                  !s.classList.contains('upinbox-tier-dot') &&
                  (s as HTMLElement).children.length === 0) {
                longestLen = text.length;
                longest = s;
              }
            });
            if (longest) {
              (longest as HTMLElement).textContent = demo.subject;
              replaced++;
            }
          }
        }

        // Fallback snippet: legacy Gmail class selectors
        if (!snippetReplaced) {
          row.querySelectorAll('.y2, .xW').forEach((s) => {
            if (s.textContent && s.textContent.trim().length > 5) {
              s.textContent = ' - ' + demo.snippet;
              replaced++;
            }
          });
        }
      }

      // ── Attribute sanitization ──
      if (sanitize) {
        row.querySelectorAll('[title], [aria-label]').forEach((el) => {
          const title = el.getAttribute('title');
          if (title && title.includes('@') && !title.includes('upinbox')) {
            el.setAttribute('title', `${demo.sender} <demo${idx}@example.com>`);
          }
          const aria = el.getAttribute('aria-label');
          if (aria && aria.includes('@')) {
            el.setAttribute('aria-label', aria.replace(/[\w.-]+@[\w.-]+/g, `demo${idx}@example.com`));
          }
        });
      }

      idx++;
    });

    // ── Hide profile elements ──
    if (hideProf) {
      // Google account avatar/button
      const profileSelectors = [
        '[data-ogsr-up]', '.gb_d.gb_Lb', 'a[href*="SignOutOptions"]',
        '.gb_Ib', '.gb_A.gb_La', 'img[data-profile-identifier]',
        'a[aria-label*="Google Account"]',
      ];
      profileSelectors.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          (el as HTMLElement).style.visibility = 'hidden';
          hidden++;
        });
      });

      // Gmail "Search mail" may show the user's email
      const searchInput = document.querySelector('input[aria-label="Search mail"]') as HTMLInputElement;
      if (searchInput && searchInput.placeholder?.includes('@')) {
        searchInput.placeholder = 'Search mail';
      }
    }

    return { replaced, hidden };
  }, { data: demoData, hideProf: hideProfile, sanitize: sanitizeAttrs });
}

// ─── WordPress admin overlay ─────────────────────────────────────────────────

async function applyWordPressOverlay(
  page: Page,
  hideProfile: boolean
): Promise<{ replaced: number; hidden: number }> {
  return page.evaluate((hideProf) => {
    let replaced = 0;
    let hidden = 0;

    // Replace admin bar user info
    if (hideProf) {
      const adminBar = document.querySelector('#wp-admin-bar-my-account');
      if (adminBar) {
        const nameEl = adminBar.querySelector('.display-name');
        if (nameEl) { nameEl.textContent = 'Demo Admin'; replaced++; }
        const avatarEl = adminBar.querySelector('.avatar');
        if (avatarEl) { (avatarEl as HTMLElement).style.visibility = 'hidden'; hidden++; }
      }
    }

    // Replace site title if it contains real info
    const siteTitle = document.querySelector('.wp-heading-inline, #site-title');
    if (siteTitle && siteTitle.textContent) {
      // Keep it — site title is usually fine for demos
    }

    return { replaced, hidden };
  }, hideProfile);
}

// ─── Shopify admin overlay ───────────────────────────────────────────────────

async function applyShopifyOverlay(
  page: Page,
  hideProfile: boolean
): Promise<{ replaced: number; hidden: number }> {
  return page.evaluate((hideProf) => {
    let replaced = 0;
    let hidden = 0;

    if (hideProf) {
      // Hide store name in nav if it's a real store
      const storeNav = document.querySelector('[data-polaris-unstyled] .Polaris-Navigation__StoreName');
      if (storeNav) {
        storeNav.textContent = 'Demo Store';
        replaced++;
      }

      // Hide user avatar
      const avatar = document.querySelector('.Polaris-Avatar');
      if (avatar) { (avatar as HTMLElement).style.visibility = 'hidden'; hidden++; }
    }

    return { replaced, hidden };
  }, hideProfile);
}

// ─── Custom rules overlay ────────────────────────────────────────────────────

async function applyCustomRules(
  page: Page,
  rules: OverlayRule[],
  sanitizeAttrs: boolean
): Promise<{ replaced: number; hidden: number }> {
  return page.evaluate(({ rls, sanitize }) => {
    let replaced = 0;
    let hidden = 0;

    for (const rule of rls) {
      const elements = document.querySelectorAll(rule.selector);
      elements.forEach((el) => {
        const action = rule.action ?? 'replace';
        if (action === 'hide') {
          (el as HTMLElement).style.visibility = 'hidden';
          hidden++;
        } else if (action === 'blur') {
          (el as HTMLElement).style.filter = 'blur(8px)';
          hidden++;
        } else if (rule.text) {
          el.textContent = rule.text;
          replaced++;
        }
      });
    }

    // Sanitize email-like strings in attributes globally
    if (sanitize) {
      document.querySelectorAll('[title], [aria-label], [placeholder]').forEach((el) => {
        ['title', 'aria-label', 'placeholder'].forEach((attr) => {
          const val = el.getAttribute(attr);
          if (val && /[\w.-]+@[\w.-]+\.\w+/.test(val)) {
            el.setAttribute(attr, val.replace(/[\w.-]+@[\w.-]+\.\w+/g, 'demo@example.com'));
          }
        });
      });
    }

    return { replaced, hidden };
  }, { rls: rules, sanitize: sanitizeAttrs });
}
