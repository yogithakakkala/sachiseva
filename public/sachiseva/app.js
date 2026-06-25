/* ===================================================
   SachiSeva (సాచిసేవ) — Application Logic
   AP Sachivalayam Welfare Eligibility App
   =================================================== */

(function() {
  'use strict';

  // ========== STATE ==========
  let currentScreen = 'home';
  let currentCategory = 'all';
  let currentChecklistSchemeId = null;
  let schemesData = null;
  let voiceEnabled = true;
  let deferredPrompt = null;
  let adminTapCount = 0;
  let adminTapTimer = null;
  let adminTimeoutTimer = null;
  let currentModalScheme = null;
  let eligibilityResultShown = false;
  let pinHash = null;

  // ========== DOM REFS (populated after DOMContentLoaded) ==========
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ========== INITIALIZATION ==========
  async function init() {
    await initPinHash();
    loadVoiceState();
    loadSchemes();
    loadCitizenProfile();
    setupRouting();
    setupVoice();
    setupPWA();
    setupServiceWorker();
    checkSchemeVersion();
    renderHomeQuickAccess();
    applySessionUI();
  }

  async function initPinHash() {
    // Stored admin PIN hash (defaults to SHA-256 of '1234')
    const stored = localStorage.getItem('adminPinHash');
    if (stored) { pinHash = stored; return; }
    pinHash = await sha256('1234');
  }

  async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // ========== SESSION / LOGIN ==========
  function getSession() {
    try { return JSON.parse(localStorage.getItem('sachiseva_session') || 'null'); }
    catch (e) { return null; }
  }
  function setSession(s) { localStorage.setItem('sachiseva_session', JSON.stringify(s)); applySessionUI(); }
  function clearSession() { localStorage.removeItem('sachiseva_session'); applySessionUI(); }

  function applySessionUI() {
    const session = getSession();
    const loginScreen = document.getElementById('login-screen');
    const adminBtn = document.getElementById('admin-btn');
    const logoutBtn = document.getElementById('logout-btn');
    if (!loginScreen) return;
    if (!session) {
      loginScreen.classList.add('active');
      if (adminBtn) adminBtn.style.display = 'none';
      if (logoutBtn) logoutBtn.style.display = 'none';
    } else {
      loginScreen.classList.remove('active');
      if (adminBtn) adminBtn.style.display = session.role === 'admin' ? 'flex' : 'none';
      if (logoutBtn) logoutBtn.style.display = session.role === 'guest' ? 'none' : 'flex';
    }
  }

  function switchLoginTab(tab) {
    document.querySelectorAll('.login-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.getElementById('login-personal').classList.toggle('active', tab === 'personal');
    document.getElementById('login-admin').classList.toggle('active', tab === 'admin');
  }

  function loginPersonal() {
    const name = (document.getElementById('login-name')?.value || '').trim();
    const phone = (document.getElementById('login-phone')?.value || '').trim();
    const village = (document.getElementById('login-village')?.value || '').trim();
    const err = document.getElementById('login-personal-error');
    err.textContent = '';
    if (name.length < 2) { err.textContent = 'Please enter your name'; return; }
    if (!/^[6-9]\d{9}$/.test(phone)) { err.textContent = 'Enter a valid 10-digit mobile number'; return; }
    // Merge into citizen profile so eligibility uses it
    let profile = getCitizenProfile() || {};
    profile.name = name; profile.phone = phone;
    if (village) profile.village = village;
    try { localStorage.setItem('citizenProfile', JSON.stringify(profile)); } catch (e) {}
    setSession({ role: 'personal', name, phone, loggedAt: Date.now() });
    showToast('✅ స్వాగతం, ' + name, 'Welcome, ' + name);
    renderProfileForm();
  }

  async function loginAdmin() {
    const input = document.getElementById('login-admin-pin')?.value || '';
    const err = document.getElementById('login-admin-error');
    err.textContent = '';
    const inputHash = await sha256(input);
    if (inputHash !== pinHash) { err.textContent = 'Incorrect PIN'; return; }
    setSession({ role: 'admin', loggedAt: Date.now() });
    showToast('🔧 అడ్మిన్ లాగిన్ విజయవంతం', 'Admin signed in');
    document.getElementById('login-admin-pin').value = '';
  }

  function loginGuest() {
    setSession({ role: 'guest', loggedAt: Date.now() });
  }

  function logout() {
    if (!confirm('Log out of SachiSeva?')) return;
    clearSession();
    closeAdminPanel();
  }

  // ========== DATA LOADING ==========
  async function loadSchemes() {
    try {
      const response = await fetch('./schemes.json');
      schemesData = await response.json();
    } catch (e) {
      // Try cache or show offline message
      console.log('Schemes fetch failed, may be offline:', e.message);
    }
    if (!schemesData) {
      showOfflineMessage();
      return;
    }
    // Merge admin-added custom schemes (offline, local-only)
    try {
      const custom = JSON.parse(localStorage.getItem('customSchemes') || '[]');
      if (Array.isArray(custom) && custom.length) {
        const existingIds = new Set(schemesData.schemes.map(s => s.id));
        custom.forEach(c => { if (!existingIds.has(c.id)) schemesData.schemes.push(c); });
      }
    } catch (e) { /* ignore */ }
    // Merge admin overrides
    mergeOverrides();
    injectValidity();
    renderHomeQuickAccess();
  }

  // ========== OFFICIAL VALIDITY (sourced from public announcements) ==========
  // null endDate + isOngoing:true = no announced end date
  const OFFICIAL_VALIDITY = {
    // SCHEMES
    ntrbharosa:        { startDate: '2024-06-13', endDate: null,         isOngoing: true  },
    tallikivandanam:   { startDate: '2025-06-12', endDate: null,         isOngoing: true, note: 'Annual: Jun 12 – Jul 5' },
    annadatasukhibhava:{ startDate: '2025-08-02', endDate: null,         isOngoing: true, note: '3 instalments per year' },
    deepam2:           { startDate: '2024-11-01', endDate: null,         isOngoing: true  },
    freebus:           { startDate: '2025-08-15', endDate: null,         isOngoing: true  },
    yuvagalam:         { startDate: null,         endDate: null,         isOngoing: false, notLaunched: true },
    aadabiddanidhi:    { startDate: null,         endDate: null,         isOngoing: false, notLaunched: true },
    pellikanuka:       { startDate: '2024-06-01', endDate: null,         isOngoing: true  },
    pmaygramin:        { startDate: '2016-11-20', endDate: null,         isOngoing: true  },
    aphousing:         { startDate: '2024-01-01', endDate: null,         isOngoing: true  },
    postmatricrtf:     { startDate: '2025-06-01', endDate: '2027-03-31', isOngoing: false, note: 'Renews each academic year' },
    postmatricmtf:     { startDate: '2025-06-01', endDate: '2027-03-31', isOngoing: false, note: 'Renews each academic year' },
    ntrvidyonnathi:    { startDate: '2025-06-26', endDate: null,         isOngoing: true, note: '9-month coaching batches' },
    ambedkaroverseas:  { startDate: '2024-04-01', endDate: null,         isOngoing: true  },
    pmkisan:           { startDate: '2019-02-24', endDate: null,         isOngoing: true  },
    nethannabharosa:   { startDate: '2025-08-07', endDate: null,         isOngoing: true  },
    adarana3:          { startDate: '2025-09-01', endDate: null,         isOngoing: true  },
    ntrarogyaseva:     { startDate: '2025-04-08', endDate: null,         isOngoing: true  },
    sccorploan:        { startDate: '2024-04-01', endDate: null,         isOngoing: true  },
    bccorploan:        { startDate: '2024-04-01', endDate: null,         isOngoing: true  },
    minorityshaadi:    { startDate: '2024-06-01', endDate: null,         isOngoing: true  },
    // SERVICES (year-round)
    castecert:         { startDate: '2024-01-01', endDate: null,         isOngoing: true  },
    incomecert:        { startDate: '2024-01-01', endDate: null,         isOngoing: true  },
    residencecert:     { startDate: '2024-01-01', endDate: null,         isOngoing: true  },
    birthcert:         { startDate: '2024-01-01', endDate: null,         isOngoing: true  },
    deathcert:         { startDate: '2024-01-01', endDate: null,         isOngoing: true  },
    marriagecert:      { startDate: '2024-01-01', endDate: null,         isOngoing: true  },
    pattadarpassbook:  { startDate: '2024-01-01', endDate: null,         isOngoing: true  },
    rationcardnew:     { startDate: '2024-01-01', endDate: null,         isOngoing: true  },
    rationcardadd:     { startDate: '2024-01-01', endDate: null,         isOngoing: true  },
  };

  // ========== VALIDITY INJECTION ==========
  function injectValidity() {
    if (!schemesData) return;
    const today = new Date();
    const todayStr = fmtDate(today);
    schemesData.schemes.forEach((s) => {
      const official = OFFICIAL_VALIDITY[s.id];
      if (official) {
        s.validity = { ...official, lastUpdated: todayStr };
      } else if (!s.validity || !s.validity.startDate) {
        s.validity = {
          startDate: fmtDate(new Date(today.getTime() - 180 * 86400000)),
          endDate: null,
          isOngoing: true,
          lastUpdated: todayStr
        };
      }
    });
  }

  function fmtDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function mergeOverrides() {
    try {
      const overrides = JSON.parse(localStorage.getItem('schemeOverrides') || '{}');
      for (const [schemeId, override] of Object.entries(overrides)) {
        const scheme = schemesData.schemes.find(s => s.id === schemeId);
        if (scheme) {
          if (override.badgeText) scheme.badgeText = override.badgeText;
          if (override.eligibility) Object.assign(scheme.eligibility, override.eligibility);
          if (override.benefitBySubType) Object.assign(scheme.benefitBySubType, override.benefitBySubType);
          scheme._hasOverride = true;
        }
      }
    } catch (e) { /* ignore */ }
  }

  function showOfflineMessage() {
    const offline = $('#offline-message');
    if (offline) offline.classList.add('active');
  }

  // ========== ROUTING ==========
  function setupRouting() {
    // Bottom nav
    $$('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const screen = item.dataset.screen;
        showScreen(screen);
      });
    });

    // Back button
    window.addEventListener('popstate', (e) => {
      if (e.state && e.state.screen) {
        showScreen(e.state.screen, false);
      }
    });

    // Initial screen
    showScreen('home', false);
  }

  function showScreen(screenId, pushState = true) {
    currentScreen = screenId;

    $$('.screen').forEach(s => s.classList.remove('active'));
    const screen = $('#screen-' + screenId);
    if (screen) screen.classList.add('active');

    $$('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.screen === screenId);
    });

    if (pushState) {
      history.pushState({ screen: screenId }, '', '#' + screenId);
    }

    // Render dynamic content
    switch (screenId) {
      case 'schemes': renderSchemesScreen(); break;
      case 'checklist': renderChecklistScreen(); break;
      case 'services': renderServicesScreen(); break;
      case 'tracker': renderTrackerScreen(); break;
      case 'help': renderHelpScreen(); break;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ========== SCHEMES SCREEN ==========
  function renderSchemesScreen() {
    if (!schemesData) return;

    const grid = $('#schemes-grid');
    if (!grid) return;

    const schemes = getFilteredSchemes();

    if (schemes.length === 0) {
      grid.innerHTML = '<div class="text-center mt-16" style="grid-column:1/-1"><span lang="te">ఏ పథకాలు కనుగొనబడలేదు</span><br><span lang="en">No schemes found</span></div>';
      return;
    }

    const categoryColors = {
      pension: '#E74C3C', education: '#2ECC71', agriculture: '#27AE60',
      household: '#F39C12', transport: '#3498DB', youth: '#9B59B6',
      women: '#E91E63', housing: '#795548', weavers: '#FF5722',
      health: '#00BCD4', scst: '#607D8B', bc: '#FF9800',
      minority: '#4CAF50', services: '#3F51B5'
    };

    const tracked = getTrackedSet();
    grid.innerHTML = schemes.map(s => {
      const overrideBadge = s._hasOverride ? ' <span style="color:#F0A500;font-size:10px;">✓</span>' : '';
      const isTracked = tracked.has(s.id);
      return `
        <div class="scheme-card ${s.category}" onclick="app.openSchemeModal('${s.id}')" role="button" aria-label="${s.nameTe} - ${s.nameEn}">
          <button class="card-star ${isTracked ? 'tracked' : ''}" onclick="event.stopPropagation();app.toggleTracked('${s.id}')" aria-label="Save to tracker" title="Save to Tracker">${isTracked ? '★' : '☆'}</button>
          <div class="card-icon">${s.icon}</div>
          <div class="card-name-te"><span lang="te">${s.nameTe}</span>${overrideBadge}</div>
          <div class="card-name-en"><span lang="en">${s.nameEn}</span></div>
          <div class="card-badge">${s.badgeText}</div>
          <div class="card-arrow" lang="te">అర్హత చూడండి →</div>
        </div>`;
    }).join('');

    // Render category pills
    renderCategoryPills();
  }

  function getFilteredSchemes() {
    if (!schemesData) return [];
    let schemes = schemesData.schemes.filter(s => s.type === 'scheme');
    const searchText = ($('#scheme-search')?.value || '').trim().toLowerCase();

    // Filter by category
    if (currentCategory !== 'all') {
      schemes = schemes.filter(s => s.category === currentCategory);
    }

    // Filter by search
    if (searchText) {
      schemes = schemes.filter(s =>
        s.nameTe.toLowerCase().includes(searchText) ||
        s.nameEn.toLowerCase().includes(searchText)
      );
    }

    // Sort super6 first
    schemes.sort((a, b) => {
      if (a.priority === 'super6' && b.priority !== 'super6') return -1;
      if (a.priority !== 'super6' && b.priority === 'super6') return 1;
      return 0;
    });

    return schemes;
  }

  function renderCategoryPills() {
    const container = $('#category-pills');
    if (!container || !schemesData) return;

    const schemeOnlyCats = schemesData.categories.filter(c =>
      c.id === 'all' || schemesData.schemes.some(s => s.category === c.id && s.type === 'scheme')
    );

    container.innerHTML = schemeOnlyCats.map(c => `
      <button class="category-pill ${currentCategory === c.id ? 'active' : ''}"
        onclick="app.setCategory('${c.id}')" role="button">
        ${c.nameTe}
      </button>
    `).join('');
  }

  function setCategory(catId) {
    currentCategory = catId;
    const searchInput = $('#scheme-search');
    if (searchInput) searchInput.value = '';
    renderSchemesScreen();
  }

  function searchSchemes() {
    renderSchemesScreen();
  }

  // ========== SCHEME MODAL ==========
  function openSchemeModal(schemeId) {
    if (!schemesData) return;
    const scheme = schemesData.schemes.find(s => s.id === schemeId);
    if (!scheme) return;

    currentModalScheme = scheme;
    eligibilityResultShown = false;

    // Speak scheme name
    speak(scheme.nameTe);

    if (scheme.type === 'service') {
      // Service: go directly to checklist
      closeModal();
      currentChecklistSchemeId = schemeId;
      showScreen('checklist');
      return;
    }

    const modal = $('#eligibility-modal');
    const body = $('#modal-body');

    if (!modal || !body) return;

    body.innerHTML = renderEligibilityForm(scheme);
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function renderEligibilityForm(scheme) {
    const profile = getCitizenProfile();
    let hasPrefill = false;

    const fieldsHtml = scheme.fields.map(fieldId => {
      const fieldDef = getFieldDefinition(fieldId);
      if (!fieldDef) return '';

      // Pre-fill from profile
      let prefillValue = '';
      if (profile) {
        const profileKey = fieldIdToProfileKey(fieldId);
        if (profileKey && profile[profileKey] !== null && profile[profileKey] !== undefined && profile[profileKey] !== '') {
          prefillValue = profile[profileKey];
          hasPrefill = true;
        }
      }

      return renderField(fieldId, fieldDef, prefillValue);
    }).join('');

    const prefillNotice = hasPrefill
      ? '<div class="prefill-notice"><span lang="te">నా వివరాల నుండి పూర్తి చేయబడింది ✓</span><br><span lang="en">Pre-filled from your profile</span></div>'
      : '';

    return `
      <div class="scheme-form-header">
        <div style="font-size:40px;text-align:center;margin-bottom:8px;">${scheme.icon}</div>
        <h2 style="text-align:center;margin-bottom:4px;"><span lang="te">${scheme.nameTe}</span></h2>
        <p style="text-align:center;font-size:12px;color:var(--text-secondary);margin-bottom:16px;"><span lang="en">${scheme.nameEn}</span></p>
      </div>
      ${prefillNotice}
      <form id="eligibility-form" onsubmit="app.submitEligibility(event, '${scheme.id}')">
        ${fieldsHtml}
        <div class="modal-footer">
          <button type="submit" class="btn-primary">
            <span lang="te">అర్హత తనిఖీ</span>
            <span lang="en" style="font-size:11px;">Check Eligibility</span>
          </button>
        </div>
      </form>`;
  }

  function renderField(fieldId, fieldDef, prefillValue) {
    let inputHtml = '';

    switch (fieldDef.type) {
      case 'number':
        inputHtml = `<input type="number" class="form-input" id="field-${fieldId}"
          min="${fieldDef.min || 0}" max="${fieldDef.max || 999999999}"
          value="${prefillValue || ''}" placeholder="${fieldDef.placeholderTe || ''}">`;
        break;
      case 'select':
        const opts = fieldDef.options.map(o => {
          const selected = prefillValue && prefillValue === o.value ? 'selected' : '';
          return `<option value="${o.value}" ${selected}>${o.labelTe} / ${o.labelEn}</option>`;
        }).join('');
        inputHtml = `<select class="form-select" id="field-${fieldId}">
          <option value="">-- <span lang="te">ఎంచుకోండి</span> / <span lang="en">Select</span> --</option>
          ${opts}
        </select>`;
        break;
      case 'toggle':
        inputHtml = `
          <div class="toggle-group">
            <button type="button" class="toggle-btn active" onclick="app.setToggle('${fieldId}','yes')" id="toggle-${fieldId}-yes">
              <span lang="te">అవును</span> / <span lang="en">Yes</span>
            </button>
            <button type="button" class="toggle-btn" onclick="app.setToggle('${fieldId}','no')" id="toggle-${fieldId}-no">
              <span lang="te">కాదు</span> / <span lang="en">No</span>
            </button>
          </div>
          <input type="hidden" id="field-${fieldId}" value="${prefillValue || 'yes'}">`;
        break;
    }

    // Show/hide conditional fields
    let conditionalClass = '';
    if (fieldDef.showWhen) {
      conditionalClass = 'conditional-field';
    }

    return `
      <div class="form-group ${conditionalClass}" data-field="${fieldId}">
        <div class="form-label">
          <span class="label-te" lang="te">${fieldDef.labelTe}${fieldDef.required ? ' *' : ''}</span>
          <span class="label-en" lang="en">${fieldDef.labelEn}</span>
        </div>
        ${inputHtml}
        <div class="field-error" role="alert">
          <span class="error-te" lang="te"></span>
          <span class="error-en" lang="en"></span>
        </div>
      </div>`;
  }

  function setToggle(fieldId, value) {
    const hidden = document.getElementById('field-' + fieldId);
    if (hidden) hidden.value = value;
    document.getElementById('toggle-' + fieldId + '-yes')?.classList.toggle('active', value === 'yes');
    document.getElementById('toggle-' + fieldId + '-no')?.classList.toggle('active', value === 'no');

    // Handle conditional fields
    handleConditionalFields();
  }

  function handleConditionalFields() {
    // Show/hide disability_percent based on pension_type
    const pensionType = document.getElementById('field-pension_type')?.value;
    const disabilityField = document.querySelector('[data-field="disability_percent"]');
    if (disabilityField) {
      disabilityField.style.display = pensionType === 'disabled' ? 'block' : 'none';
    }

    // Show/hide house_value based on has_pucca_house
    const hasPucca = document.getElementById('field-has_pucca_house')?.value;
    const houseValueField = document.querySelector('[data-field="house_value"]');
    if (houseValueField) {
      houseValueField.style.display = hasPucca === 'yes' ? 'block' : 'none';
    }
  }

  // ========== ELIGIBILITY ENGINE ==========
  function submitEligibility(event, schemeId) {
    event.preventDefault();
    const scheme = schemesData.schemes.find(s => s.id === schemeId);
    if (!scheme) return;

    // Clear previous errors
    $$('.field-error').forEach(el => el.classList.remove('visible'));
    $$('.form-input.error, .form-select.error').forEach(el => el.classList.remove('error'));

    // Collect form data
    const formData = {};
    let hasError = false;

    for (const fieldId of scheme.fields) {
      const fieldDef = getFieldDefinition(fieldId);
      const input = document.getElementById('field-' + fieldId);
      if (!input) continue;

      let value = input.value;

      if (fieldDef.type === 'number') {
        value = value === '' ? null : parseFloat(value);
      }

      formData[fieldId] = value;

      // Validate required
      if (fieldDef.required && (value === null || value === '' || value === undefined || (fieldDef.type === 'number' && isNaN(value)))) {
        showFieldError(fieldId, 'ఈ ఫీల్డ్ అవసరం', 'This field is required');
        hasError = true;
        continue;
      }

      // Validate range
      if (fieldDef.type === 'number' && value !== null && !isNaN(value)) {
        if (fieldDef.min !== undefined && value < fieldDef.min) {
          showFieldError(fieldId, `కనీసం ${fieldDef.min} ఉండాలి`, `Minimum ${fieldDef.min} required`);
          hasError = true;
        }
        if (fieldDef.max !== undefined && value > fieldDef.max) {
          showFieldError(fieldId, `గరిష్టం ${fieldDef.max}`, `Maximum ${fieldDef.max}`);
          hasError = true;
        }
      }

      // Special: conditional required fields
      if (fieldId === 'disability_percent' && formData.pension_type === 'disabled' && (value === null || value === '' || isNaN(value))) {
        showFieldError('disability_percent', 'వైకల్యం శాతం అవసరం', 'Disability percentage required');
        hasError = true;
      }
    }

    if (hasError) return;

    // Run eligibility check
    const result = checkEligibility(scheme, formData);
    eligibilityResultShown = true;

    // Speak result
    if (result.eligible) {
      const benefitText = result.benefitAmount ? `. ${result.benefitAmount.replace('₹', 'రూపాయలు ').replace('/మాసం', 'ప్రతి నెల')}` : '';
      speak(`మీరు ${scheme.nameTe} కి అర్హులు${benefitText}`);
    } else {
      speak(`మీరు ${scheme.nameTe} కి అర్హులు కాదు. ${result.reason.te}`);
    }

    // Render result
    const body = $('#modal-body');
    if (!body) return;

    body.innerHTML = renderEligibilityResult(scheme, result, formData);

    // Scroll to top of modal
    const modalContent = document.querySelector('.modal');
    if (modalContent) modalContent.scrollTop = 0;
  }

  function checkEligibility(scheme, formData) {
    const criteria = scheme.eligibility;
    const reason = { te: '', en: '' };

    // Check AP residency
    if (criteria.is_ap_resident === true && formData.is_ap_resident !== 'yes') {
      reason.te = 'మీరు ఆంధ్రప్రదేశ్ నివాసి అయి ఉండాలి';
      reason.en = 'You must be a resident of Andhra Pradesh';
      return { eligible: false, reason, benefitAmount: '' };
    }

    // Check gender
    if (criteria.gender && formData.gender && formData.gender !== criteria.gender) {
      const genderMap = { Male: 'పురుషులు', Female: 'మహిళలు', Other: 'ఇతరులు' };
      reason.te = `ఈ పథకం ${genderMap[criteria.gender] || criteria.gender} కోసం మాత్రమే`;
      reason.en = `This scheme is only for ${criteria.gender}`;
      return { eligible: false, reason, benefitAmount: '' };
    }

    // Check age
    if (criteria.age_min && formData.age !== null && formData.age < criteria.age_min) {
      reason.te = `వయస్సు ${criteria.age_min} సంవత్సరాలు అవసరం`;
      reason.en = `Age ${criteria.age_min} years required`;
      return { eligible: false, reason, benefitAmount: '' };
    }
    if (criteria.age_max && formData.age !== null && formData.age > criteria.age_max) {
      reason.te = `వయస్సు ${criteria.age_max} సంవత్సరాల కంటే తక్కువగా ఉండాలి`;
      reason.en = `Age must be below ${criteria.age_max} years`;
      return { eligible: false, reason, benefitAmount: '' };
    }

    // Check income
    if (criteria.income_monthly_max && formData.income_monthly !== null && formData.income_monthly > criteria.income_monthly_max) {
      reason.te = `కుటుంబ ఆదాయం నెలకు ₹${criteria.income_monthly_max} కంటే తక్కువగా ఉండాలి`;
      reason.en = `Family income must be below ₹${criteria.income_monthly_max}/month`;
      return { eligible: false, reason, benefitAmount: '' };
    }
    if (criteria.income_annual_max && formData.income_annual !== null && formData.income_annual > criteria.income_annual_max) {
      reason.te = `వార్షిక ఆదాయం ₹${criteria.income_annual_max} కంటే తక్కువగా ఉండాలి`;
      reason.en = `Annual income must be below ₹${criteria.income_annual_max}`;
      return { eligible: false, reason, benefitAmount: '' };
    }

    // Check govt employee
    if (criteria.is_govt_employee === false && formData.is_govt_employee === 'yes') {
      reason.te = 'ప్రభుత్వ ఉద్యోగులు అర్హులు కాదు';
      reason.en = 'Government employees are not eligible';
      return { eligible: false, reason, benefitAmount: '' };
    }

    // Check income tax payer
    if (criteria.is_income_tax_payer === false && formData.is_income_tax_payer === 'yes') {
      reason.te = 'ఆదాయపు పన్ను చెల్లించేవారు అర్హులు కాదు';
      reason.en = 'Income tax payers are not eligible';
      return { eligible: false, reason, benefitAmount: '' };
    }

    // Check caste
    if (criteria.caste && formData.caste) {
      if (!criteria.caste.includes(formData.caste)) {
        const casteNames = {
          SC: 'SC', ST: 'ST', BC: 'BC', Minority: 'మైనారిటీ', OC: 'OC', EWS: 'EWS'
        };
        const casteList = criteria.caste.map(c => casteNames[c] || c).join(', ');
        reason.te = `ఈ పథకం ${casteList} కోసం మాత్రమే`;
        reason.en = `This scheme is only for ${casteList}`;
        return { eligible: false, reason, benefitAmount: '' };
      }
    }

    // Check ration card
    if (criteria.ration_card_type && formData.ration_card_type) {
      if (!criteria.ration_card_type.includes(formData.ration_card_type)) {
        reason.te = `ఈ పథకం ${criteria.ration_card_type.join(', ')} రేషన్ కార్డ్ ఉన్నవారికి మాత్రమే`;
        reason.en = `This scheme requires ${criteria.ration_card_type.join(' or ')} ration card`;
        return { eligible: false, reason, benefitAmount: '' };
      }
    }

    // Check farmer registration
    if (criteria.is_registered_farmer === true && formData.is_registered_farmer !== 'yes') {
      reason.te = 'రైతుగా నమోదు అయి ఉండాలి';
      reason.en = 'Must be registered as a farmer';
      return { eligible: false, reason, benefitAmount: '' };
    }

    // Check child in school
    if (criteria.child_in_school === true && formData.child_in_school !== 'yes') {
      reason.te = 'పిల్లలు పాఠశాలలో చదువుతూ ఉండాలి';
      reason.en = 'Children must be enrolled in school';
      return { eligible: false, reason, benefitAmount: '' };
    }

    // Check has pucca house
    if (criteria.has_pucca_house === false && formData.has_pucca_house === 'yes') {
      // NTR Bharosa specific: check house value too
      if (scheme.id === 'ntrbharosa' && criteria.house_value_max && formData.house_value !== null && formData.house_value > criteria.house_value_max) {
        reason.te = `పక్కా ఇల్లు ఉండి, విలువ ₹${criteria.house_value_max} కంటే ఎక్కువ`;
        reason.en = `Has pucca house and value exceeds ₹${criteria.house_value_max}`;
        return { eligible: false, reason, benefitAmount: '' };
      }
      reason.te = 'పక్కా ఇల్లు ఉండకూడదు';
      reason.en = 'Must not have a pucca house';
      return { eligible: false, reason, benefitAmount: '' };
    }

    // Check weaver
    if (criteria.is_weaver === true && formData.is_weaver !== 'yes') {
      reason.te = 'నేత కార్మికుడు అయి ఉండాలి';
      reason.en = 'Must be a weaver';
      return { eligible: false, reason, benefitAmount: '' };
    }

    // Check unemployed
    if (criteria.is_unemployed === true && formData.is_unemployed !== 'yes') {
      reason.te = 'నిరుద్యోగి అయి ఉండాలి';
      reason.en = 'Must be unemployed';
      return { eligible: false, reason, benefitAmount: '' };
    }

    // Check education level
    if (criteria.education_level && formData.education_level) {
      if (!criteria.education_level.includes(formData.education_level)) {
        reason.te = `${criteria.education_level.join(', ')} చదువు అవసరం`;
        reason.en = `Education level ${criteria.education_level.join(' or ')} required`;
        return { eligible: false, reason, benefitAmount: '' };
      }
    }

    // Check bride community
    if (criteria.bride_community && formData.bride_community) {
      if (!criteria.bride_community.includes(formData.bride_community)) {
        reason.te = `ఈ పథకం ${criteria.bride_community.join(', ')} వధువులకు మాత్రమే`;
        reason.en = `This scheme is only for ${criteria.bride_community.join('/')} brides`;
        return { eligible: false, reason, benefitAmount: '' };
      }
    }

    // Check existing scheme enrollment
    if (criteria.existing_scheme_enrollment === false && formData.existing_scheme_enrollment === 'yes') {
      reason.te = 'ఇప్పటికే మరో AP పథకంలో నమోదు చేసుకున్నవారు అర్హులు కాదు';
      reason.en = 'Already enrolled in another AP scheme - not eligible';
      return { eligible: false, reason, benefitAmount: '' };
    }

    // Check occupation
    if (criteria.occupation && formData.occupation) {
      if (!criteria.occupation.includes(formData.occupation)) {
        reason.te = `ఈ పథకం ${criteria.occupation.join(', ')} వృత్తి వారికి మాత్రమే`;
        reason.en = `This scheme is only for ${criteria.occupation.join('/')}`;
        return { eligible: false, reason, benefitAmount: '' };
      }
    }

    // Check exam type
    if (criteria.exam_type && formData.exam_type) {
      if (!criteria.exam_type.includes(formData.exam_type)) {
        reason.te = 'ఈ పరీక్ష రకం సరిపోల లేదు';
        reason.en = 'Exam type does not match';
        return { eligible: false, reason, benefitAmount: '' };
      }
    }

    // Check foreign admission
    if (criteria.foreign_university_admission === true && formData.foreign_university_admission !== 'yes') {
      reason.te = 'విదేశీ యూనివర్సిటీలో ప్రవేశం ఉండాలి';
      reason.en = 'Must have admission in a foreign university';
      return { eligible: false, reason, benefitAmount: '' };
    }

    // Check has LPG (Deepam - should NOT have LPG)
    if (criteria.has_lpg === false && formData.has_lpg === 'yes') {
      reason.te = 'ఇప్పటికే LPG కనెక్షన్ ఉన్నవారు అర్హులు కాదు';
      reason.en = 'Already having LPG connection - not eligible';
      return { eligible: false, reason, benefitAmount: '' };
    }

    // NTR Bharosa specific checks for sub-types
    if (scheme.id === 'ntrbharosa') {
      const pt = formData.pension_type;
      if (pt === 'old_age' && formData.age !== null && formData.age < (criteria.age_old_age_min || 60)) {
        reason.te = `వృద్ధాప్య పింఛన్ కు వయస్సు ${criteria.age_old_age_min || 60} సంవత్సరాలు అవసరం`;
        reason.en = `Old age pension requires age ${criteria.age_old_age_min || 60}`;
        return { eligible: false, reason, benefitAmount: '' };
      }
      if ((pt === 'weaver' || pt === 'fisherman') && formData.age !== null && formData.age < (criteria.age_weaver_min || 50)) {
        reason.te = `${pt === 'weaver' ? 'నేత' : 'మత్స్యకార'} పింఛన్ కు వయస్సు ${criteria.age_weaver_min || 50} సంవత్సరాలు అవసరం`;
        reason.en = `${pt === 'weaver' ? 'Weaver' : 'Fisherman'} pension requires age ${criteria.age_weaver_min || 50}`;
        return { eligible: false, reason, benefitAmount: '' };
      }
      if ((pt === 'widow' || pt === 'single_woman') && formData.gender !== 'Female') {
        reason.te = 'ఈ పింఛన్ మహిళలకు మాత్రమే';
        reason.en = 'This pension is only for women';
        return { eligible: false, reason, benefitAmount: '' };
      }
      if (pt === 'disabled' && (formData.disability_percent === null || formData.disability_percent < (criteria.disability_percent_min || 40))) {
        reason.te = `వైకల్యం ${criteria.disability_percent_min || 40}% కంటే ఎక్కువగా ఉండాలి`;
        reason.en = `Disability must be above ${criteria.disability_percent_min || 40}%`;
        return { eligible: false, reason, benefitAmount: '' };
      }
    }

    // Calculate benefit amount
    let benefitAmount = scheme.badgeText || '';
    if (scheme.id === 'ntrbharosa') {
      const pt = formData.pension_type;
      if (pt === 'disabled') {
        benefitAmount = '₹6,000/మాసం';
      } else if (pt === 'single_woman' || pt === 'widow') {
        benefitAmount = '₹1,500/మాసం';
      } else {
        benefitAmount = '₹4,000/మాసం';
      }
    }

    return { eligible: true, reason: { te: '', en: '' }, benefitAmount };
  }

  function renderEligibilityResult(scheme, result, formData) {
    const docs = renderDocumentChecklistInline(scheme);

    if (result.eligible) {
      return `
        <div class="result-container">
          <div class="result-icon eligible">
            <svg class="checkmark-svg" viewBox="0 0 52 52">
              <circle class="checkmark-circle" cx="26" cy="26" r="25"/>
              <path class="checkmark-check" d="M14 27l7 7 16-16"/>
            </svg>
          </div>
          <div class="result-title-te result-eligible" lang="te">మీరు అర్హులు!</div>
          <div class="result-title-en" lang="en">You are eligible!</div>
          ${result.benefitAmount ? `<div class="result-benefit">${result.benefitAmount}</div>` : ''}
          <div class="disclaimer-box">
            <div class="disc-icon">⚠️</div>
            <div class="disc-te" lang="te">గమనిక: ఈ ఫలితం మార్గదర్శక సమాచారం మాత్రమే. అంతిమ అర్హత నిర్ణయం సచివాలయం అధికారులు చేస్తారు.</div>
            <div class="disc-en" lang="en">Note: This result is indicative guidance only. Final eligibility is determined by Sachivalayam officials.</div>
          </div>
          <h3 style="margin-top:16px;"><span lang="te">అవసరమైన పత్రాలు</span><br><span lang="en" style="font-size:12px;color:var(--text-secondary);">Required Documents</span></h3>
          ${docs}
          <div class="mt-16">
            <button class="btn-primary" onclick="app.viewChecklist('${scheme.id}')">
              <span lang="te">చెక్‌లిస్ట్ చూడండి</span>
            </button>
            <button class="btn-secondary mt-8" onclick="app.resetEligibilityForm('${scheme.id}')">
              <span lang="te">మళ్ళీ తనిఖీ చేయండి</span>
            </button>
          </div>
        </div>`;
    } else {
      return `
        <div class="result-container">
          <div class="result-icon not-eligible">✕</div>
          <div class="result-title-te result-not-eligible" lang="te">మీరు అర్హులు కాదు</div>
          <div class="result-title-en" lang="en">You are not eligible</div>
          <div class="result-reason">
            <div class="reason-te" lang="te">${result.reason.te}</div>
            <div class="reason-en" lang="en">${result.reason.en}</div>
          </div>
          <div class="disclaimer-box">
            <div class="disc-icon">⚠️</div>
            <div class="disc-te" lang="te">గమనిక: ఈ ఫలితం మార్గదర్శక సమాచారం మాత్రమే. అంతిమ అర్హత నిర్ణయం సచివాలయం అధికారులు చేస్తారు.</div>
            <div class="disc-en" lang="en">Note: This result is indicative guidance only.</div>
          </div>
          <button class="btn-primary mt-12" onclick="app.resetEligibilityForm('${scheme.id}')">
            <span lang="te">మళ్ళీ తనిఖీ చేయండి</span>
            <span lang="en" style="font-size:11px;">Check Again</span>
          </button>
        </div>`;
    }
  }

  function renderDocumentChecklistInline(scheme) {
    if (!scheme.documents || scheme.documents.length === 0) return '';
    return scheme.documents.map(d => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
        <span style="font-size:24px;">${d.icon}</span>
        <div>
          <div style="font-family:'Noto Sans Telugu',serif;font-weight:700;font-size:14px;" lang="te">${d.nameTe}</div>
          <div style="font-family:'Inter',sans-serif;font-size:11px;color:var(--text-secondary);" lang="en">${d.nameEn}</div>
        </div>
      </div>`).join('');
  }

  function resetEligibilityForm(schemeId) {
    eligibilityResultShown = false;
    const scheme = schemesData.schemes.find(s => s.id === schemeId);
    if (!scheme) return;
    const body = $('#modal-body');
    if (body) body.innerHTML = renderEligibilityForm(scheme);
  }

  function viewChecklist(schemeId) {
    closeModal();
    currentChecklistSchemeId = schemeId;
    showScreen('checklist');
  }

  function closeModal() {
    const modal = $('#eligibility-modal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
    currentModalScheme = null;
    eligibilityResultShown = false;
  }

  function showFieldError(fieldId, teMsg, enMsg) {
    const input = document.getElementById('field-' + fieldId);
    if (input) {
      input.classList.add('error');
      const formGroup = input.closest('.form-group');
      if (formGroup) {
        const errorEl = formGroup.querySelector('.field-error');
        if (errorEl) {
          errorEl.classList.add('visible');
          const teSpan = errorEl.querySelector('.error-te');
          const enSpan = errorEl.querySelector('.error-en');
          if (teSpan) teSpan.textContent = teMsg;
          if (enSpan) enSpan.textContent = enMsg;
        }
      }
    }
  }

  // ========== FIELD DEFINITIONS ==========
  function getFieldDefinition(fieldId) {
    const fields = {
      age: { type: 'number', labelTe: 'వయస్సు', labelEn: 'Age', required: true, min: 1, max: 120 },
      gender: { type: 'select', labelTe: 'లింగం', labelEn: 'Gender', required: true, options: [
        { value: 'Male', labelTe: 'పురుషుడు', labelEn: 'Male' },
        { value: 'Female', labelTe: 'స్త్రీ', labelEn: 'Female' },
        { value: 'Other', labelTe: 'ఇతర', labelEn: 'Other' }
      ]},
      marital_status: { type: 'select', labelTe: 'వివాహ స్థితి', labelEn: 'Marital Status', required: false, options: [
        { value: 'Single', labelTe: 'అవివాహిత', labelEn: 'Single' },
        { value: 'Married', labelTe: 'వివాహితుడు', labelEn: 'Married' },
        { value: 'Widowed', labelTe: 'వితంతువు', labelEn: 'Widowed' },
        { value: 'Divorced', labelTe: 'విడాకులు', labelEn: 'Divorced' }
      ]},
      income_monthly: { type: 'number', labelTe: 'నెలవారీ ఆదాయం (₹)', labelEn: 'Monthly Income (₹)', required: true, min: 0, max: 9999999 },
      income_annual: { type: 'number', labelTe: 'వార్షిక కుటుంబ ఆదాయం (₹)', labelEn: 'Annual Family Income (₹)', required: true, min: 0, max: 99999999 },
      ration_card_type: { type: 'select', labelTe: 'రేషన్ కార్డ్ రకం', labelEn: 'Ration Card Type', required: true, options: [
        { value: 'White', labelTe: 'తెలుపు', labelEn: 'White' },
        { value: 'Yellow', labelTe: 'పసుపు', labelEn: 'Yellow' },
        { value: 'Other', labelTe: 'ఇతర', labelEn: 'Other' },
        { value: 'None', labelTe: 'లేదు', labelEn: 'None' }
      ]},
      caste: { type: 'select', labelTe: 'కులం', labelEn: 'Caste', required: true, options: [
        { value: 'SC', labelTe: 'SC', labelEn: 'SC' },
        { value: 'ST', labelTe: 'ST', labelEn: 'ST' },
        { value: 'BC', labelTe: 'BC', labelEn: 'BC' },
        { value: 'Minority', labelTe: 'మైనారిటీ', labelEn: 'Minority' },
        { value: 'OC', labelTe: 'OC', labelEn: 'OC' },
        { value: 'EWS', labelTe: 'EWS', labelEn: 'EWS' }
      ]},
      is_govt_employee: { type: 'toggle', labelTe: 'ప్రభుత్వ ఉద్యోగా?', labelEn: 'Government Employee?', required: true },
      is_income_tax_payer: { type: 'toggle', labelTe: 'ఆదాయపు పన్ను చెల్లిస్తారా?', labelEn: 'Income Tax Payer?', required: true },
      pension_type: { type: 'select', labelTe: 'పింఛన్ రకం', labelEn: 'Pension Type', required: true, options: [
        { value: 'old_age', labelTe: 'వృద్ధాప్యం', labelEn: 'Old Age' },
        { value: 'widow', labelTe: 'వితంతువు', labelEn: 'Widow' },
        { value: 'disabled', labelTe: 'వికలాంగుడు', labelEn: 'Disabled' },
        { value: 'single_woman', labelTe: 'ఒంటరి మహిళ', labelEn: 'Single Woman' },
        { value: 'weaver', labelTe: 'నేత', labelEn: 'Weaver' },
        { value: 'fisherman', labelTe: 'మత్స్యకారుడు', labelEn: 'Fisherman' }
      ]},
      disability_percent: { type: 'number', labelTe: 'వైకల్యం శాతం (%)', labelEn: 'Disability Percentage (%)', required: false, min: 0, max: 100 },
      has_pucca_house: { type: 'toggle', labelTe: 'పక్కా ఇల్లు ఉందా?', labelEn: 'Has Pucca House?', required: true },
      house_value: { type: 'number', labelTe: 'ఇంటి విలువ (₹)', labelEn: 'House Value (₹)', required: false, min: 0, max: 99999999 },
      is_registered_farmer: { type: 'toggle', labelTe: 'రైతుగా నమోదు చేసుకున్నారా?', labelEn: 'Registered Farmer?', required: true },
      land_acres: { type: 'number', labelTe: 'భూమి (ఎకరాలు)', labelEn: 'Land (Acres)', required: false, min: 0, max: 10000 },
      is_weaver: { type: 'toggle', labelTe: 'నేత కార్మికుడివా?', labelEn: 'Are you a Weaver?', required: true },
      has_lpg: { type: 'toggle', labelTe: 'ఇప్పటికే LPG కనెక్షన్ ఉందా?', labelEn: 'Already have LPG Connection?', required: true },
      child_in_school: { type: 'toggle', labelTe: 'పిల్లలు పాఠశాలలో ఉన్నారా?', labelEn: 'Children in School?', required: true },
      child_class: { type: 'select', labelTe: 'పిల్లల తరగతి', labelEn: 'Child Class', required: true, options: [
        { value: 'Class 1', labelTe: 'Class 1', labelEn: 'Class 1' },
        { value: 'Class 2', labelTe: 'Class 2', labelEn: 'Class 2' },
        { value: 'Class 3', labelTe: 'Class 3', labelEn: 'Class 3' },
        { value: 'Class 4', labelTe: 'Class 4', labelEn: 'Class 4' },
        { value: 'Class 5', labelTe: 'Class 5', labelEn: 'Class 5' },
        { value: 'Class 6', labelTe: 'Class 6', labelEn: 'Class 6' },
        { value: 'Class 7', labelTe: 'Class 7', labelEn: 'Class 7' },
        { value: 'Class 8', labelTe: 'Class 8', labelEn: 'Class 8' },
        { value: 'Class 9', labelTe: 'Class 9', labelEn: 'Class 9' },
        { value: 'Class 10', labelTe: 'Class 10', labelEn: 'Class 10' },
        { value: 'Class 11', labelTe: 'Class 11', labelEn: 'Class 11' },
        { value: 'Class 12', labelTe: 'Class 12', labelEn: 'Class 12' },
        { value: 'Intermediate', labelTe: 'Intermediate', labelEn: 'Intermediate' }
      ]},
      education_level: { type: 'select', labelTe: 'విద్యార్హత', labelEn: 'Education Level', required: true, options: [
        { value: 'Below 10th', labelTe: '10వ తరగతి లోపు', labelEn: 'Below 10th' },
        { value: 'SSC', labelTe: 'SSC/10th', labelEn: 'SSC' },
        { value: 'Intermediate', labelTe: 'ఇంటర్మీడియట్', labelEn: 'Intermediate' },
        { value: 'Degree', labelTe: 'డిగ్రీ', labelEn: 'Degree' },
        { value: 'PG', labelTe: 'PG', labelEn: 'PG' }
      ]},
      is_unemployed: { type: 'toggle', labelTe: 'నిరుద్యోగివా?', labelEn: 'Unemployed?', required: true },
      exam_type: { type: 'select', labelTe: 'పరీక్ష రకం', labelEn: 'Exam Type', required: true, options: [
        { value: 'UPSC', labelTe: 'UPSC', labelEn: 'UPSC' },
        { value: 'APPSC', labelTe: 'APPSC', labelEn: 'APPSC' },
        { value: 'Group exams', labelTe: 'Group exams', labelEn: 'Group exams' }
      ]},
      foreign_university_admission: { type: 'toggle', labelTe: 'విదేశీ యూనివర్సిటీలో ప్రవేశం ఉందా?', labelEn: 'Foreign University Admission?', required: true },
      is_ap_resident: { type: 'toggle', labelTe: 'ఆంధ్రప్రదేశ్ నివాసివా?', labelEn: 'AP Resident?', required: true },
      occupation: { type: 'select', labelTe: 'వృత్తి', labelEn: 'Occupation', required: true, options: [
        { value: 'Toddy Tapper', labelTe: 'కల్లు గీత కార్మికుడు', labelEn: 'Toddy Tapper' },
        { value: 'Artisan', labelTe: 'హస్తకళాకారుడు', labelEn: 'Artisan' },
        { value: 'Weaver', labelTe: 'నేత కార్మికుడు', labelEn: 'Weaver' },
        { value: 'Fisherman', labelTe: 'మత్స్యకారుడు', labelEn: 'Fisherman' },
        { value: 'Other', labelTe: 'ఇతర', labelEn: 'Other' }
      ]},
      existing_scheme_enrollment: { type: 'toggle', labelTe: 'ఇప్పటికే AP పథకంలో నమోదు చేసుకున్నారా?', labelEn: 'Already enrolled in AP scheme?', required: true },
      marriage_purpose: { type: 'toggle', labelTe: 'వివాహ నిమిత్తం?', labelEn: 'For Marriage Purpose?', required: false },
      bride_community: { type: 'select', labelTe: 'వధువు కులం', labelEn: 'Bride Community', required: true, options: [
        { value: 'SC', labelTe: 'SC', labelEn: 'SC' },
        { value: 'ST', labelTe: 'ST', labelEn: 'ST' },
        { value: 'BC', labelTe: 'BC', labelEn: 'BC' },
        { value: 'Minority', labelTe: 'మైనారిటీ', labelEn: 'Minority' },
        { value: 'Disabled', labelTe: 'వికలాంగురాలు', labelEn: 'Disabled' }
      ]}
    };
    return fields[fieldId] || null;
  }

  function fieldIdToProfileKey(fieldId) {
    const map = {
      age: 'age', gender: 'gender', caste: 'caste',
      income_monthly: 'income_monthly', ration_card_type: 'ration_card_type',
      is_ap_resident: 'is_ap_resident'
    };
    return map[fieldId] || null;
  }

  // ========== SERVICES SCREEN ==========
  function renderServicesScreen() {
    if (!schemesData) return;
    const container = $('#services-list');
    if (!container) return;

    const services = schemesData.schemes.filter(s => s.type === 'service');

    container.innerHTML = services.map(s => {
      const docCount = s.documents ? s.documents.length : 0;
      return `
        <div class="card mb-12" onclick="app.openServiceChecklist('${s.id}')" style="cursor:pointer;">
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:36px;">${s.icon}</span>
            <div style="flex:1;">
              <div style="font-family:'Noto Sans Telugu',serif;font-weight:700;font-size:16px;" lang="te">${s.nameTe}</div>
              <div style="font-family:'Inter',sans-serif;font-size:12px;color:var(--text-secondary);" lang="en">${s.nameEn}</div>
              <div class="card-badge" style="margin-top:6px;">${docCount} పత్రాలు</div>
            </div>
            <span style="color:var(--accent);font-weight:600;font-size:14px;" lang="te">చెక్‌లిస్ట్ చూడండి →</span>
          </div>
        </div>`;
    }).join('');
  }

  function openServiceChecklist(serviceId) {
    currentChecklistSchemeId = serviceId;
    showScreen('checklist');
  }

  // ========== CHECKLIST SCREEN ==========
  function renderChecklistScreen() {
    const container = $('#checklist-container');
    if (!schemesData) return;

    const scheme = currentChecklistSchemeId
      ? schemesData.schemes.find(s => s.id === currentChecklistSchemeId)
      : null;

    if (!scheme) {
      // No scheme picked yet — show a picker (services first, then schemes)
      if (!container) return;
      const services = schemesData.schemes.filter(s => s.type === 'service');
      const others = schemesData.schemes.filter(s => s.type !== 'service');
      const cardHtml = (s) => `
        <div class="card mb-12" onclick="app.viewChecklist('${s.id}')" style="cursor:pointer;">
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:32px;">${s.icon}</span>
            <div style="flex:1;">
              <div style="font-family:'Noto Sans Telugu',serif;font-weight:700;font-size:15px;" lang="te">${s.nameTe}</div>
              <div style="font-family:'Inter',sans-serif;font-size:12px;color:var(--text-secondary);" lang="en">${s.nameEn}</div>
            </div>
            <span style="color:var(--accent);font-weight:600;font-size:13px;" lang="te">చూడండి →</span>
          </div>
        </div>`;
      container.innerHTML = `
        <div class="section-header"><span lang="te">పథకం ఎంచుకోండి</span></div>
        <div class="section-subtitle"><span lang="en">Pick a scheme or service to view its checklist</span></div>
        ${services.length ? `<div class="section-header" style="margin-top:12px;"><span lang="te">సచివాలయ సేవలు / Services</span></div>${services.map(cardHtml).join('')}` : ''}
        ${others.length ? `<div class="section-header" style="margin-top:12px;"><span lang="te">పథకాలు / Schemes</span></div>${others.map(cardHtml).join('')}` : ''}
      `;
      return;
    }

    // Ensure container has the original checklist markup (it may have been replaced by the picker above)
    if (container && !$('#documents-grid')) {
      container.innerHTML = `
        <div id="checklist-scheme-info"></div>
        <div class="progress-bar-container">
          <div class="progress-bar-label" id="checklist-progress-label">
            <span lang="te">0 / 0 పత్రాలు సిద్ధంగా ఉన్నాయి</span>
          </div>
          <div class="progress-bar">
            <div class="progress-bar-fill" id="checklist-progress-fill" style="width:0%;"></div>
          </div>
        </div>
        <div id="documents-grid" class="documents-grid"></div>
        <div id="checklist-sticky" class="sticky-bar warning"></div>
      `;
    }

    const docs = scheme.documents || [];
    const totalDocs = docs.length;

    // Count checked documents
    let checkedCount = 0;
    docs.forEach((doc, i) => {
      const key = `checklist_${scheme.id}_${i}`;
      try {
        if (localStorage.getItem(key) === 'true') checkedCount++;
      } catch (e) { /* ignore */ }
    });

    const progressPercent = totalDocs > 0 ? Math.round((checkedCount / totalDocs) * 100) : 0;
    const allReady = checkedCount === totalDocs;

    const schemeEl = $('#checklist-scheme-info');
    const docsGrid = $('#documents-grid');
    const progressBar = $('#checklist-progress-fill');
    const progressLabel = $('#checklist-progress-label');
    const stickyBar = $('#checklist-sticky');

    if (schemeEl) {
      const categoryBadge = schemesData.categories.find(c => c.id === scheme.category);
      schemeEl.innerHTML = `
        <div class="checklist-header">
          <span class="scheme-icon">${scheme.icon}</span>
          <div>
            <h2><span lang="te">${scheme.nameTe}</span></h2>
            <p style="font-size:12px;color:var(--text-secondary);"><span lang="en">${scheme.nameEn}</span></p>
            ${categoryBadge ? `<span class="card-badge">${categoryBadge.nameTe}</span>` : ''}
          </div>
        </div>`;
    }

    if (progressBar) progressBar.style.width = progressPercent + '%';
    if (progressLabel) {
      progressLabel.innerHTML = `<span lang="te">${checkedCount} / ${totalDocs} పత్రాలు సిద్ధంగా ఉన్నాయి</span>`;
    }

    if (docsGrid) {
      docsGrid.innerHTML = docs.map((doc, i) => {
        const key = `checklist_${scheme.id}_${i}`;
        let isChecked = false;
        try { isChecked = localStorage.getItem(key) === 'true'; } catch (e) { /* ignore */ }
        return `
          <div class="doc-card ${isChecked ? 'checked' : ''}" onclick="app.toggleDocCheck('${scheme.id}',${i})" role="checkbox" aria-checked="${isChecked}">
            <div class="check-overlay">✓</div>
            <div class="doc-icon">${doc.icon}</div>
            <div class="doc-name-te" lang="te">${doc.nameTe}</div>
            <div class="doc-name-en" lang="en">${doc.nameEn}</div>
            <button class="voice-btn" onclick="event.stopPropagation();app.speakDoc('${doc.nameTe}')" aria-label="Voice">🔊</button>
          </div>`;
      }).join('');
    }

    if (stickyBar) {
      if (allReady) {
        stickyBar.className = 'sticky-bar success';
        stickyBar.innerHTML = `
          <div class="bar-text-te" lang="te">✅ సచివాలయానికి వెళ్ళడానికి సిద్ధంగా ఉన్నారు!</div>
          <div class="bar-text-en" lang="en">All documents ready — visit Sachivalayam!</div>`;
      } else {
        const missingDocs = [];
        docs.forEach((doc, i) => {
          const key = `checklist_${scheme.id}_${i}`;
          let isChecked = false;
          try { isChecked = localStorage.getItem(key) === 'true'; } catch (e) { /* ignore */ }
          if (!isChecked) missingDocs.push(doc.nameTe);
        });
        stickyBar.className = 'sticky-bar warning';
        stickyBar.innerHTML = `
          <div class="bar-text-te" lang="te">${totalDocs - checkedCount} పత్రాలు మిస్సింగ్</div>
          <div class="bar-text-en" lang="en">Missing: ${missingDocs.slice(0, 3).join(', ')}${missingDocs.length > 3 ? '...' : ''}</div>`;
      }
    }
  }

  function toggleDocCheck(schemeId, docIndex) {
    const key = `checklist_${schemeId}_${docIndex}`;
    let current = false;
    try { current = localStorage.getItem(key) === 'true'; } catch (e) { return; }
    try {
      localStorage.setItem(key, !current);
    } catch (e) {
      showToast('ప్రైవేట్ మోడ్‌లో వివరాలు సేవ్ కాదు', 'Details won\'t be saved in private mode');
      return;
    }
    renderChecklistScreen();
  }

  function speakDoc(teText) {
    speak(teText);
  }

  function shareChecklist(schemeId) {
    const scheme = schemesData.schemes.find(s => s.id === schemeId);
    if (!scheme) return;

    const docs = scheme.documents || [];
    const lines = [`${scheme.nameTe} — ${scheme.nameEn}`, '', 'Documents:'];

    docs.forEach((doc, i) => {
      const key = `checklist_${schemeId}_${i}`;
      let isChecked = false;
      try { isChecked = localStorage.getItem(key) === 'true'; } catch (e) { /* ignore */ }
      const checkmark = isChecked ? '✅' : '❌';
      lines.push(`${checkmark} ${doc.nameTe} (${doc.nameEn})`);
    });

    const shareText = lines.join('\n');

    if (navigator.share) {
      navigator.share({
        title: scheme.nameTe,
        text: shareText
      }).catch(() => {
        // User cancelled — no action needed
      });
    } else {
      // Fallback: print
      window.print();
    }
  }

  // ========== HELP SCREEN ==========
  function renderHelpScreen() {
    // How-to steps
    const howtoEl = $('#help-howto');
    if (howtoEl) {
      const steps = [
        { num: '1', te: 'పథకాలను బ్రౌజ్ చేయండి', en: 'Browse welfare schemes' },
        { num: '2', te: 'మీ వివరాలు నింపండి', en: 'Fill in your details' },
        { num: '3', te: 'అర్హత ఫలితం & పత్రాల జాబితా పొందండి', en: 'Get eligibility result & document checklist' }
      ];
      howtoEl.innerHTML = steps.map(s => `
        <div class="howto-step">
          <div class="step-num">${s.num}</div>
          <div>
            <div class="step-text-te" lang="te">${s.te}</div>
            <div class="step-text-en" lang="en">${s.en}</div>
          </div>
        </div>`).join('');
    }

    // FAQ
    const faqEl = $('#help-faq');
    if (faqEl) {
      const faqs = [
        { q: 'ఈ యాప్ ఎలా ఉపయోగించాలి?', qEn: 'How to use this app?', a: 'మీరు అర్హత తెలుసుకోవాలనుకునే పథకాన్ని ఎంచుకోండి. మీ వివరాలు నింపి "అర్హత తనిఖీ" బటన్ నొక్కండి.', aEn: 'Select the scheme you want, fill in your details, and tap "Check Eligibility".' },
        { q: 'ఈ యాప్‌లో నమోదు చేసుకోవచ్చా?', qEn: 'Can I enroll through this app?', a: 'లేదు, ఈ యాప్ కేవలం అర్హత మార్గదర్శిని మాత్రమే. నమోదు కోసం సచివాలయానికి వెళ్ళాలి.', aEn: 'No, this is only an eligibility guidance tool. Visit Sachivalayam for enrollment.' },
        { q: 'నా సమాచారం సురక్షితమేనా?', qEn: 'Is my data safe?', a: 'మీ వివరాలు మీ పరికరంలో మాత్రమే నిల్వ చేయబడతాయి. ఎటువంటి సర్వర్‌కు పంపబడవు.', aEn: 'Your data is stored only on your device. Nothing is sent to any server.' },
        { q: 'ఈ యాప్ ఆఫ్‌లైన్‌లో పనిచేస్తుందా?', qEn: 'Does this app work offline?', a: 'అవును, మొదటిసారి లోడ్ చేసిన తర్వాత పూర్తిగా ఆఫ్‌లైన్‌లో కూడా పనిచేస్తుంది.', aEn: 'Yes, after first load it works fully offline.' },
        { q: 'సమాచారం ఎంతవరకు తాజాది?', qEn: 'How current is the information?', a: 'జనవరి 2025 నాటి డేటా. కొత్త సమాచారం కోసం సచివాలయాన్ని సంప్రదించండి.', aEn: 'Data as of January 2025. Contact Sachivalayam for latest updates.' }
      ];
      faqEl.innerHTML = faqs.map((faq, i) => `
        <div class="faq-item" id="faq-${i}">
          <div class="faq-question" onclick="document.getElementById('faq-${i}').classList.toggle('open')">
            <span class="faq-q-te" lang="te">${faq.q}</span>
            <span class="faq-q-en" lang="en" style="display:block;font-size:10px;color:var(--text-secondary);font-weight:400;">${faq.qEn}</span>
            <span class="faq-arrow">▼</span>
          </div>
          <div class="faq-answer">
            <div class="faq-a-te" lang="te">${faq.a}</div>
            <div class="faq-a-en" lang="en">${faq.aEn}</div>
          </div>
        </div>`).join('');
    }

    // Profile form
    renderProfileForm();

    // Version badge
    const versionEl = $('#version-badge');
    if (versionEl && schemesData) {
      versionEl.innerHTML = `v${schemesData.meta.version}`;
    }
  }

  // ========== CITIZEN PROFILE ==========
  function getCitizenProfile() {
    try {
      return JSON.parse(localStorage.getItem('citizenProfile'));
    } catch (e) { return null; }
  }

  function loadCitizenProfile() {
    const profile = getCitizenProfile();
    if (profile) {
      // Pre-fill profile form if available
      setTimeout(() => {
        for (const [key, value] of Object.entries(profile)) {
          const el = document.getElementById('profile-' + key);
          if (el && value !== null && value !== undefined) {
            el.value = value;
          }
        }
      }, 500);
    }
  }

  function renderProfileForm() {
    const container = $('#profile-form-container');
    if (!container) return;

    const profile = getCitizenProfile() || {};
    const fields = [
      { id: 'name', labelTe: 'పేరు', labelEn: 'Full Name', type: 'text' },
      { id: 'village', labelTe: 'గ్రామం/నగరం', labelEn: 'Village/City', type: 'text' },
      { id: 'aadhaar_last4', labelTe: 'ఆధార్ చివరి 4 అంకెలు', labelEn: 'Aadhaar Last 4 Digits', type: 'text', maxlength: 4, pattern: '[0-9]{4}' },
      { id: 'age', labelTe: 'వయస్సు', labelEn: 'Age', type: 'number', min: 1, max: 120 },
      { id: 'income_monthly', labelTe: 'నెలవారీ ఆదాయం (₹)', labelEn: 'Monthly Income (₹)', type: 'number' },
      { id: 'gender', labelTe: 'లింగం', labelEn: 'Gender', type: 'select', options: [
        { value: '', labelTe: 'ఎంచుకోండి', labelEn: 'Select' },
        { value: 'Male', labelTe: 'పురుషుడు', labelEn: 'Male' },
        { value: 'Female', labelTe: 'స్త్రీ', labelEn: 'Female' },
        { value: 'Other', labelTe: 'ఇతర', labelEn: 'Other' }
      ]},
      { id: 'caste', labelTe: 'కులం', labelEn: 'Caste', type: 'select', options: [
        { value: '', labelTe: 'ఎంచుకోండి', labelEn: 'Select' },
        { value: 'SC', labelTe: 'SC', labelEn: 'SC' },
        { value: 'ST', labelTe: 'ST', labelEn: 'ST' },
        { value: 'BC', labelTe: 'BC', labelEn: 'BC' },
        { value: 'Minority', labelTe: 'మైనారిటీ', labelEn: 'Minority' },
        { value: 'OC', labelTe: 'OC', labelEn: 'OC' },
        { value: 'EWS', labelTe: 'EWS', labelEn: 'EWS' }
      ]},
      { id: 'ration_card_type', labelTe: 'రేషన్ కార్డ్ రకం', labelEn: 'Ration Card Type', type: 'select', options: [
        { value: '', labelTe: 'ఎంచుకోండి', labelEn: 'Select' },
        { value: 'White', labelTe: 'తెలుపు', labelEn: 'White' },
        { value: 'Yellow', labelTe: 'పసుపు', labelEn: 'Yellow' },
        { value: 'Other', labelTe: 'ఇతర', labelEn: 'Other' },
        { value: 'None', labelTe: 'లేదు', labelEn: 'None' }
      ]}
    ];

    container.innerHTML = `
      <div style="background:#FFF3CD;border-radius:8px;padding:10px;margin-bottom:12px;font-size:11px;">
        ⚠️ <span lang="te">మీ పూర్తి ఆధార్ నంబర్ ఇక్కడ నమోదు చేయవద్దు</span>
        <br><span lang="en">Do not enter your full Aadhaar number here</span>
      </div>
      ${fields.map(f => {
        let inputHtml = '';
        if (f.type === 'select' && f.options) {
          inputHtml = `<select class="form-select" id="profile-${f.id}">${f.options.map(o => `<option value="${o.value}" ${(profile[f.id] || '') === o.value ? 'selected' : ''}>${o.labelTe} / ${o.labelEn}</option>`).join('')}</select>`;
        } else {
          inputHtml = `<input type="${f.type}" class="form-input" id="profile-${f.id}" value="${profile[f.id] || ''}"
            ${f.maxlength ? `maxlength="${f.maxlength}"` : ''} ${f.pattern ? `pattern="${f.pattern}"` : ''}
            ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''}>`;
        }
        return `
          <div class="form-group">
            <div class="form-label">
              <span class="label-te" lang="te">${f.labelTe}</span>
              <span class="label-en" lang="en">${f.labelEn}</span>
            </div>
            ${inputHtml}
          </div>`;
      }).join('')}
      <button class="btn-primary" onclick="app.saveProfile()">
        <span lang="te">వివరాలు సేవ్ & అర్హత తనిఖీ</span>
        <span lang="en" style="font-size:11px;">Save & Find Eligible Schemes</span>
      </button>
      <button class="btn-secondary" style="margin-top:8px;width:100%;" onclick="app.findMyEligibleSchemes()">
        <span lang="te">🎯 నా అర్హత పథకాలు చూపించు</span>
        <span lang="en" style="font-size:11px;">Show My Eligible Schemes</span>
      </button>`;
  }

  function saveProfile() {
    const profile = {
      name: document.getElementById('profile-name')?.value || '',
      village: document.getElementById('profile-village')?.value || '',
      aadhaar_last4: document.getElementById('profile-aadhaar_last4')?.value || '',
      age: parseInt(document.getElementById('profile-age')?.value) || null,
      income_monthly: parseFloat(document.getElementById('profile-income_monthly')?.value) || null,
      gender: document.getElementById('profile-gender')?.value || '',
      caste: document.getElementById('profile-caste')?.value || '',
      ration_card_type: document.getElementById('profile-ration_card_type')?.value || ''
    };

    // Validate Aadhaar last 4
    if (profile.aadhaar_last4 && !/^\d{4}$/.test(profile.aadhaar_last4)) {
      showToast('చివరి 4 అంకెలు సరిగ్గా నమోదు చేయండి', 'Enter exactly 4 digits for Aadhaar');
      return;
    }

    try {
      localStorage.setItem('citizenProfile', JSON.stringify(profile));
      showToast('✅ వివరాలు సేవ్ చేయబడ్డాయి', 'Profile saved successfully');
      // Auto-run eligibility matcher
      setTimeout(() => findMyEligibleSchemes(), 300);
    } catch (e) {
      showToast('ప్రైవేట్ మోడ్‌లో వివరాలు సేవ్ కాదు', 'Details won\'t be saved in private mode');
    }
  }

  // ========== ELIGIBILITY MATCHER ==========
  function findMyEligibleSchemes() {
    const profile = getCitizenProfile();
    if (!profile || !profile.age || !profile.gender) {
      showToast('మొదట మీ వివరాలు పూర్తి చేయండి', 'Please complete your profile first (age & gender required)');
      showScreen('help');
      return;
    }
    if (!schemesData) return;

    const defaults = {
      is_govt_employee: 'no', is_income_tax_payer: 'no', has_pucca_house: 'no',
      has_lpg: 'no', is_registered_farmer: 'no', is_weaver: 'no',
      is_unemployed: 'no', is_ap_resident: 'yes', child_in_school: 'no',
      foreign_university_admission: 'no', existing_scheme_enrollment: 'no',
      marriage_purpose: 'no', pension_type: profile.age >= 60 ? 'old_age' : 'widow',
      house_value: 0, land_acres: 0, disability_percent: 0,
      occupation: 'Other', bride_community: profile.caste || 'BC',
      education_level: 'Below 10th', child_class: 'Class 5',
      exam_type: 'UPSC', marital_status: 'Married',
      income_annual: (profile.income_monthly || 0) * 12
    };

    const eligible = [];
    const ineligible = [];
    const schemes = schemesData.schemes.filter(s => s.type === 'scheme');

    schemes.forEach(scheme => {
      const formData = {};
      (scheme.fields || []).forEach(fid => {
        if (profile[fid] !== undefined && profile[fid] !== null && profile[fid] !== '') {
          formData[fid] = profile[fid];
        } else if (defaults[fid] !== undefined) {
          formData[fid] = defaults[fid];
        } else {
          formData[fid] = null;
        }
      });
      try {
        const res = checkEligibility(scheme, formData);
        if (res.eligible) eligible.push({ scheme, benefitAmount: res.benefitAmount });
        else ineligible.push({ scheme, reason: res.reason });
      } catch (e) { /* skip */ }
    });

    const services = schemesData.schemes.filter(s => s.type === 'service');

    const modal = $('#eligibility-modal');
    const body = $('#modal-body');
    if (!modal || !body) return;

    body.innerHTML = `
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:48px;">🎯</div>
        <h2 lang="te" style="margin:4px 0;">మీ అర్హత ఫలితాలు</h2>
        <p lang="en" style="font-size:12px;color:var(--text-secondary);">Your Personalized Eligibility Results</p>
      </div>

      <div class="card" style="background:linear-gradient(135deg,#E8F5E9,#C8E6C9);margin-bottom:16px;text-align:center;">
        <div style="font-size:28px;font-weight:700;color:#1B5E20;">${eligible.length}</div>
        <div lang="te" style="font-weight:600;">పథకాలకు అర్హులు</div>
        <div lang="en" style="font-size:11px;">Schemes you qualify for</div>
      </div>

      ${eligible.length === 0
        ? '<div class="card" style="text-align:center;padding:16px;"><p lang="te">సరిపోలే పథకాలు కనుగొనబడలేదు</p><p lang="en" style="font-size:11px;color:var(--text-secondary);">No matching schemes found. Try updating your profile.</p></div>'
        : `<h3 lang="te" style="font-size:14px;margin:12px 0 8px;">✅ అర్హత ఉన్న పథకాలు</h3>` +
          eligible.map(({ scheme, benefitAmount }) => `
            <div class="card mb-12" onclick="app.closeModal();app.openSchemeModal('${scheme.id}')" style="cursor:pointer;border-left:4px solid #2E7D32;">
              <div style="display:flex;align-items:center;gap:12px;">
                <span style="font-size:32px;">${scheme.icon}</span>
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:700;font-size:14px;" lang="te">${scheme.nameTe}</div>
                  <div style="font-size:11px;color:var(--text-secondary);" lang="en">${scheme.nameEn}</div>
                  ${benefitAmount ? `<div class="card-badge" style="margin-top:4px;background:#2E7D32;color:#fff;">${benefitAmount}</div>` : ''}
                </div>
                <span style="color:var(--accent);font-weight:700;">→</span>
              </div>
            </div>`).join('')
      }

      <h3 lang="te" style="font-size:14px;margin:20px 0 8px;padding-top:12px;border-top:1px solid #eee;">📄 సచివాలయం సేవలు (${services.length})</h3>
      <p lang="en" style="font-size:10px;color:var(--text-secondary);margin-bottom:8px;">Certificate services available to all citizens</p>
      ${services.map(s => `
        <div class="card mb-12" onclick="app.closeModal();app.openServiceChecklist('${s.id}')" style="cursor:pointer;">
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:28px;">${s.icon}</span>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:600;font-size:13px;" lang="te">${s.nameTe}</div>
              <div style="font-size:11px;color:var(--text-secondary);" lang="en">${s.nameEn}</div>
            </div>
            <span style="color:var(--accent);">→</span>
          </div>
        </div>`).join('')}

      ${ineligible.length > 0 ? `
        <details style="margin-top:16px;">
          <summary style="cursor:pointer;font-size:12px;color:var(--text-secondary);padding:8px;">
            <span lang="te">అర్హత లేని పథకాలు చూపించు (${ineligible.length})</span> /
            <span lang="en">Show ineligible schemes</span>
          </summary>
          <div style="margin-top:8px;">
            ${ineligible.map(({ scheme, reason }) => `
              <div class="card mb-12" style="opacity:0.7;border-left:4px solid #C62828;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <span style="font-size:24px;">${scheme.icon}</span>
                  <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;font-size:13px;" lang="te">${scheme.nameTe}</div>
                    <div style="font-size:10px;color:#C62828;" lang="en">${reason.en || ''}</div>
                  </div>
                </div>
              </div>`).join('')}
          </div>
        </details>` : ''}

      <p style="font-size:10px;color:var(--text-secondary);margin-top:16px;padding:8px;background:#FFF3CD;border-radius:6px;text-align:center;" lang="en">
        ⚠️ Indicative guidance only. Final eligibility is determined by Sachivalayam officials.
      </p>`;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  // ========== VOICE SYSTEM ==========
  function loadVoiceState() {
    try {
      const stored = localStorage.getItem('voiceEnabled');
      if (stored !== null) voiceEnabled = stored === 'true';
    } catch (e) { /* ignore */ }
    updateVoiceToggle();
  }

  function updateVoiceToggle() {
    const btn = $('#voice-toggle');
    if (btn) {
      btn.classList.toggle('active', voiceEnabled);
      btn.textContent = voiceEnabled ? '🔊' : '🔇';
    }
  }

  function setupVoice() {
    // Preload voices
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }

  function toggleVoice() {
    voiceEnabled = !voiceEnabled;
    try { localStorage.setItem('voiceEnabled', voiceEnabled); } catch (e) { /* ignore */ }
    updateVoiceToggle();

    if (!voiceEnabled && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  function speak(teluguText) {
    if (!voiceEnabled) return;
    if (!window.speechSynthesis) {
      showVoiceUnavailableBanner();
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(teluguText);
    utterance.lang = 'te-IN';
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const teVoice = voices.find(v => v.lang === 'te-IN')
      || voices.find(v => v.lang.startsWith('te'))
      || null;

    if (teVoice) {
      utterance.voice = teVoice;
      window.speechSynthesis.speak(utterance);
    } else {
      showVoiceUnavailableBanner();
    }
  }

  function showVoiceUnavailableBanner() {
    const banner = $('#voice-unavailable');
    if (banner) {
      banner.classList.add('active');
      banner.innerHTML = '<span lang="te">మీ ఫోన్‌లో తెలుగు వాయిస్ అందుబాటులో లేదు</span>';
      setTimeout(() => banner.classList.remove('active'), 3000);
    }
  }

  // ========== PWA & INSTALL ==========
  function setupPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showInstallBanner();
    });

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return;
    }
  }

  function showInstallBanner() {
    try {
      if (localStorage.getItem('installDismissed') === 'true') return;
    } catch (e) { return; }

    const banner = $('#install-banner');
    if (banner) banner.classList.add('active');
  }

  function installApp() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => {
        deferredPrompt = null;
        const banner = $('#install-banner');
        if (banner) banner.classList.remove('active');
      });
    }
  }

  function dismissInstall() {
    const banner = $('#install-banner');
    if (banner) banner.classList.remove('active');
    try { localStorage.setItem('installDismissed', 'true'); } catch (e) { /* ignore */ }
  }

  function setupServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // Service worker failed — app still works
      });
    }
  }

  // ========== STALE VERSION CHECK ==========
  function checkSchemeVersion() {
    if (!schemesData) return;
    const meta = schemesData.meta;
    const [year, month] = meta.version.split('-').map(Number);
    const versionDate = new Date(year, month - 1);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    if (versionDate < sixMonthsAgo) {
      try {
        if (localStorage.getItem('staleBannerDismissed') === meta.version) return;
      } catch (e) { return; }

      const banner = $('#stale-banner');
      if (banner) {
        banner.classList.add('active');
        banner.innerHTML = `
          <span lang="te" style="font-size:12px;font-weight:600;">⚠️ సమాచారం పాతది కావచ్చు</span>
          <button onclick="app.dismissStaleBanner()" style="background:none;border:none;font-size:16px;cursor:pointer;">✕</button>`;
      }
    }
  }

  function dismissStaleBanner() {
    const banner = $('#stale-banner');
    if (banner) banner.classList.remove('active');
    if (schemesData) {
      try { localStorage.setItem('staleBannerDismissed', schemesData.meta.version); } catch (e) { /* ignore */ }
    }
  }

  // ========== ADMIN PANEL ==========
  function setupAdminAccess() {
    adminTapCount++;
    if (adminTapTimer) clearTimeout(adminTapTimer);
    adminTapTimer = setTimeout(() => { adminTapCount = 0; }, 3000);

    if (adminTapCount >= 5) {
      adminTapCount = 0;
      showPinDialog();
    }
  }

  function showPinDialog() {
    const dialog = $('#pin-dialog');
    if (dialog) {
      dialog.classList.add('active');
      dialog.innerHTML = `
        <div class="pin-box">
          <h3 style="margin-bottom:16px;">🔐 <span lang="te">అడ్మిన్ PIN</span></h3>
          <input type="password" class="form-input mb-12" id="pin-input" placeholder="Enter PIN" autocomplete="off" maxlength="6">
          <div id="pin-error" style="color:var(--danger);font-size:12px;margin-bottom:8px;display:none;"></div>
          <div class="flex gap-8">
            <button class="btn-secondary" onclick="document.getElementById('pin-dialog').classList.remove('active')">Cancel</button>
            <button class="btn-primary" onclick="app.verifyPin()">Login</button>
          </div>
        </div>`;
      setTimeout(() => {
        const input = document.getElementById('pin-input');
        if (input) input.focus();
      }, 100);
    }
  }

  async function verifyPin() {
    const input = document.getElementById('pin-input')?.value || '';
    const errorEl = document.getElementById('pin-error');

    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const inputHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (inputHash === pinHash) {
      document.getElementById('pin-dialog')?.classList.remove('active');
      openAdminPanel();
    } else {
      if (errorEl) {
        errorEl.style.display = 'block';
        errorEl.textContent = 'Incorrect PIN';
      }
    }
  }

  function openAdminPanel() {
    const panel = $('#admin-panel');
    if (!panel) return;

    panel.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Session timeout: 10 minutes
    if (adminTimeoutTimer) clearTimeout(adminTimeoutTimer);
    adminTimeoutTimer = setTimeout(closeAdminPanel, 10 * 60 * 1000);

    renderAdminPanel();
  }

  function closeAdminPanel() {
    const panel = $('#admin-panel');
    if (panel) panel.classList.remove('active');
    document.body.style.overflow = '';
    if (adminTimeoutTimer) clearTimeout(adminTimeoutTimer);
  }

  function renderAdminPanel() {
    const body = $('#admin-panel-body');
    if (!body || !schemesData) return;

    const overrides = getSchemeOverrides();
    const changeLog = getChangeLog();

    const schemesHtml = schemesData.schemes.map(s => {
      const hasOverride = overrides[s.id];
      return `
        <div class="card mb-8" style="display:flex;align-items:center;justify-content:space-between;">
          <div style="flex:1;">
            <div style="font-family:'Noto Sans Telugu',serif;font-weight:700;font-size:14px;" lang="te">${s.nameTe}</div>
            <div style="font-size:11px;color:var(--text-secondary);" lang="en">${s.nameEn}</div>
            ${hasOverride ? '<span class="card-badge">నవీకరించబడింది ✓</span>' : ''}
          </div>
          <button class="btn-secondary btn-sm" onclick="app.editSchemeOverride('${s.id}')">
            <span lang="te">నవీకరించు</span>
          </button>
        </div>`;
    }).join('');

    body.innerHTML = `
      <div class="admin-warning">
        ⚠️ <span lang="te">ఈ మార్పులు ఈ పరికరంపై మాత్రమే వర్తిస్తాయి</span><br>
        <span lang="en" style="font-size:10px;">⚠️ Changes apply to this device only</span>
      </div>

      <div class="flex gap-8 mb-12" style="flex-wrap:wrap;">
        <button class="btn-primary btn-sm" onclick="app.showAddScheme()">➕ <span lang="te">కొత్త పథకం</span> / Add Scheme</button>
        <button class="btn-secondary btn-sm" onclick="app.showChangePin()">🔑 Change PIN</button>
      </div>

      <h3 style="margin-bottom:12px;"><span lang="te">పథకం ఓవర్‌రైడ్‌లు</span> / Schemes</h3>
      <div style="max-height:400px;overflow-y:auto;margin-bottom:16px;">${schemesHtml}</div>
      <button class="btn-secondary mb-8" onclick="app.resetAllOverrides()">
        <span lang="te">అన్నీ రీసెట్ చేయండి</span> / <span lang="en">Reset All</span>
      </button>

      <h3 style="margin:16px 0 8px;"><span lang="te">మార్పు లాగ్</span></h3>
      <div id="admin-changelog" style="max-height:200px;overflow-y:auto;font-size:11px;">
        ${changeLog.length === 0 ? '<p style="color:var(--text-secondary);">No changes yet</p>' :
          changeLog.slice(-20).reverse().map(entry => `
            <div style="padding:4px 0;border-bottom:1px solid var(--border);">
              <strong>${entry.schemeId}</strong> — ${entry.field}<br>
              <span style="color:var(--text-secondary);">${new Date(entry.timestamp).toLocaleString()}</span>
            </div>`).join('')}
      </div>

      <div id="admin-editor" class="mt-12" style="display:none;"></div>`;
  }

  function showAddScheme() {
    const editor = $('#admin-editor');
    if (!editor) return;
    editor.style.display = 'block';
    editor.innerHTML = `
      <h4 style="margin-bottom:8px;">➕ Add New Scheme</h4>
      <label class="form-label">Scheme ID (lowercase, no spaces)</label>
      <input class="form-input mb-8" id="new-scheme-id" placeholder="myscheme">
      <label class="form-label">Name (Telugu)</label>
      <input class="form-input mb-8" id="new-scheme-name-te" placeholder="పథకం పేరు">
      <label class="form-label">Name (English)</label>
      <input class="form-input mb-8" id="new-scheme-name-en" placeholder="Scheme Name">
      <label class="form-label">Category</label>
      <select class="form-select mb-8" id="new-scheme-category">
        <option value="pension">Pension</option>
        <option value="housing">Housing</option>
        <option value="education">Education</option>
        <option value="agriculture">Agriculture</option>
        <option value="health">Health</option>
        <option value="welfare">Welfare</option>
      </select>
      <label class="form-label">Benefit Badge (e.g. ₹3,000/మాసం)</label>
      <input class="form-input mb-8" id="new-scheme-badge" placeholder="₹X/month">
      <label class="form-label">Short Description (English)</label>
      <textarea class="form-input mb-8" id="new-scheme-desc" style="height:60px;"></textarea>
      <label class="form-label">Eligibility (JSON)</label>
      <textarea class="form-input mb-8" id="new-scheme-elig" style="height:100px;font-family:monospace;font-size:12px;">{
  "age_min": 18,
  "income_monthly_max": 10000
}</textarea>
      <div id="new-scheme-error" style="color:var(--danger);font-size:12px;margin:4px 0;"></div>
      <div class="flex gap-8">
        <button class="btn-secondary" onclick="document.getElementById('admin-editor').style.display='none'">Cancel</button>
        <button class="btn-primary" onclick="app.saveNewScheme()">Save Scheme</button>
      </div>`;
  }

  function saveNewScheme() {
    const err = document.getElementById('new-scheme-error');
    err.textContent = '';
    const id = (document.getElementById('new-scheme-id').value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
    const nameTe = document.getElementById('new-scheme-name-te').value.trim();
    const nameEn = document.getElementById('new-scheme-name-en').value.trim();
    const category = document.getElementById('new-scheme-category').value;
    const badgeText = document.getElementById('new-scheme-badge').value.trim();
    const desc = document.getElementById('new-scheme-desc').value.trim();
    let eligibility;
    try { eligibility = JSON.parse(document.getElementById('new-scheme-elig').value); }
    catch (e) { err.textContent = 'Invalid eligibility JSON'; return; }
    if (!id || !nameTe || !nameEn) { err.textContent = 'ID and both names are required'; return; }
    if (schemesData.schemes.some(s => s.id === id)) { err.textContent = 'A scheme with this ID already exists'; return; }

    const newScheme = {
      id, nameTe, nameEn, category, badgeText,
      descriptionEn: desc, descriptionTe: desc,
      eligibility,
      documents: [],
      validity: { startDate: new Date().toISOString().slice(0,10), endDate: null, isOngoing: true },
      isCustom: true
    };
    // Store in custom schemes
    const custom = getCustomSchemes();
    custom.push(newScheme);
    localStorage.setItem('customSchemes', JSON.stringify(custom));
    schemesData.schemes.push(newScheme);

    addChangeLog(id, 'ADDED', null, JSON.stringify(newScheme));
    renderAdminPanel();
    document.getElementById('admin-editor').style.display = 'none';
    showToast('✅ కొత్త పథకం జోడించబడింది', 'New scheme added');
  }

  function getCustomSchemes() {
    try { return JSON.parse(localStorage.getItem('customSchemes') || '[]'); }
    catch (e) { return []; }
  }

  function showChangePin() {
    const editor = $('#admin-editor');
    if (!editor) return;
    editor.style.display = 'block';
    editor.innerHTML = `
      <h4 style="margin-bottom:8px;">🔑 Change Admin PIN</h4>
      <label class="form-label">Current PIN</label>
      <input type="password" class="form-input mb-8" id="pin-current" maxlength="6">
      <label class="form-label">New PIN (4-6 digits)</label>
      <input type="password" class="form-input mb-8" id="pin-new" maxlength="6" inputmode="numeric">
      <label class="form-label">Confirm New PIN</label>
      <input type="password" class="form-input mb-8" id="pin-confirm" maxlength="6" inputmode="numeric">
      <div id="pin-change-error" style="color:var(--danger);font-size:12px;margin:4px 0;"></div>
      <div class="flex gap-8">
        <button class="btn-secondary" onclick="document.getElementById('admin-editor').style.display='none'">Cancel</button>
        <button class="btn-primary" onclick="app.saveNewPin()">Update PIN</button>
      </div>`;
  }

  async function saveNewPin() {
    const err = document.getElementById('pin-change-error');
    err.textContent = '';
    const cur = document.getElementById('pin-current').value;
    const neu = document.getElementById('pin-new').value;
    const conf = document.getElementById('pin-confirm').value;
    if (await sha256(cur) !== pinHash) { err.textContent = 'Current PIN incorrect'; return; }
    if (!/^\d{4,6}$/.test(neu)) { err.textContent = 'New PIN must be 4-6 digits'; return; }
    if (neu !== conf) { err.textContent = 'PINs do not match'; return; }
    pinHash = await sha256(neu);
    localStorage.setItem('adminPinHash', pinHash);
    addChangeLog('*', 'PIN_CHANGED', null, null);
    document.getElementById('admin-editor').style.display = 'none';
    showToast('✅ PIN నవీకరించబడింది', 'PIN updated');
  }

  function editSchemeOverride(schemeId) {
    const editor = $('#admin-editor');
    if (!editor) return;

    const overrides = getSchemeOverrides();
    const current = overrides[schemeId] || null;

    editor.style.display = 'block';
    editor.innerHTML = `
      <h4 style="margin-bottom:8px;">Editing: ${schemeId}</h4>
      <p style="font-size:11px;margin-bottom:8px;">Edit benefit amount and eligibility as JSON:</p>
      <textarea id="override-json-input" class="form-input" style="height:200px;font-family:monospace;font-size:13px;">${current ? JSON.stringify(current, null, 2) : `{
  "badgeText": "₹XX/మాసం",
  "eligibility": {
    "age_min": 60,
    "income_monthly_max": 10000
  }
}`}</textarea>
      <div id="override-error" style="color:var(--danger);font-size:12px;margin:4px 0;display:none;"></div>
      <div class="flex gap-8 mt-8">
        <button class="btn-secondary" onclick="document.getElementById('admin-editor').style.display='none'">Cancel</button>
        <button class="btn-primary" onclick="app.saveSchemeOverride('${schemeId}')">
          <span lang="te">సేవ్ చేయండి</span>
        </button>
      </div>`;
  }

  function saveSchemeOverride(schemeId) {
    const textarea = document.getElementById('override-json-input');
    const errorEl = document.getElementById('override-error');
    if (!textarea) return;

    let parsed;
    try {
      parsed = JSON.parse(textarea.value);
    } catch (e) {
      if (errorEl) {
        errorEl.style.display = 'block';
        errorEl.innerHTML = '<span lang="te">JSON తప్పుగా ఉంది — సేవ్ కాలేదు</span>';
      }
      return;
    }

    try {
      const overrides = getSchemeOverrides();
      const oldValue = overrides[schemeId] ? JSON.stringify(overrides[schemeId]) : null;
      overrides[schemeId] = parsed;
      localStorage.setItem('schemeOverrides', JSON.stringify(overrides));

      // Log change
      addChangeLog(schemeId, 'eligibility', oldValue, JSON.stringify(parsed));

      // Reload
      mergeOverrides();
      renderAdminPanel();
      document.getElementById('admin-editor').style.display = 'none';
      showToast('✅ సేవ్ చేయబడింది', 'Saved successfully');
    } catch (e) {
      showToast('సేవ్ చేయడంలో లోపం', 'Error saving');
    }
  }

  function resetAllOverrides() {
    try {
      localStorage.removeItem('schemeOverrides');
      addChangeLog('*', 'ALL', 'reset', 'defaults');
      mergeOverrides();
      renderAdminPanel();
      showToast('✅ రీసెట్ చేయబడింది', 'Reset complete');
    } catch (e) { /* ignore */ }
  }

  function getSchemeOverrides() {
    try { return JSON.parse(localStorage.getItem('schemeOverrides') || '{}'); }
    catch (e) { return {}; }
  }

  function getChangeLog() {
    try { return JSON.parse(localStorage.getItem('adminChangeLog') || '[]'); }
    catch (e) { return []; }
  }

  function addChangeLog(schemeId, field, oldValue, newValue) {
    try {
      const log = getChangeLog();
      log.push({ schemeId, field, oldValue, newValue, timestamp: Date.now() });
      localStorage.setItem('adminChangeLog', JSON.stringify(log));
    } catch (e) { /* ignore */ }
  }

  // ========== HOME QUICK ACCESS ==========
  function renderHomeQuickAccess() {
    const grid = $('#quick-access-grid');
    if (!grid) return;

    const items = [
      { icon: '👴', te: 'పింఛన్లు', en: 'Pension', cat: 'pension' },
      { icon: '🏠', te: 'గృహ నిర్మాణం', en: 'Housing', cat: 'housing' },
      { icon: '🎓', te: 'విద్య', en: 'Education', cat: 'education' },
      { icon: '🌾', te: 'వ్యవసాయం', en: 'Agriculture', cat: 'agriculture' },
      { icon: '🏥', te: 'ఆరోగ్యం', en: 'Health', cat: 'health' },
      { icon: '📄', te: 'సేవలు', en: 'Services', cat: 'services' }
    ];

    grid.innerHTML = items.map(item => `
      <div class="quick-access-item" onclick="app.navigateToCategory('${item.cat}')">
        <div class="qa-icon">${item.icon}</div>
        <div class="qa-label-te" lang="te">${item.te}</div>
        <div class="qa-label-en" lang="en">${item.en}</div>
      </div>`).join('');
  }

  function navigateToCategory(catId) {
    currentCategory = catId;
    showScreen('schemes');
  }

  // ========== TOAST ==========
  function showToast(teMsg, enMsg) {
    const container = $('#toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span lang="te">${teMsg}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ========== TRACKER ==========
  function getTrackedSet() {
    try {
      const arr = JSON.parse(localStorage.getItem('trackedSchemes') || '[]');
      return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) { return new Set(); }
  }

  function toggleTracked(schemeId) {
    const set = getTrackedSet();
    if (set.has(schemeId)) {
      set.delete(schemeId);
      showToast('⭐ తీసివేయబడింది / Removed');
    } else {
      set.add(schemeId);
      showToast('⭐ సేవ్ చేయబడింది / Saved to Tracker');
    }
    localStorage.setItem('trackedSchemes', JSON.stringify([...set]));
    if (currentScreen === 'schemes') renderSchemesScreen();
    if (currentScreen === 'tracker') renderTrackerScreen();
  }

  function classifyScheme(s) {
    const v = s.validity;
    if (!v) return 'active';
    if (v.notLaunched) return 'upcoming';
    if (v.isOngoing) return 'active';
    const today = new Date(); today.setHours(0,0,0,0);
    const todayMs = today.getTime();
    const DAY = 86400000;
    if (v.startDate) {
      const start = new Date(v.startDate).getTime();
      if (start > todayMs) return 'upcoming';
    }
    if (v.endDate) {
      const end = new Date(v.endDate).getTime();
      const diff = Math.ceil((end - todayMs) / DAY);
      if (diff < 0) return 'expired';
      if (diff <= 30) return 'ending';
      return 'active';
    }
    return 'active';
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const today = new Date(); today.setHours(0,0,0,0);
    return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000);
  }

  function renderTrackerScreen() {
    if (!schemesData) return;
    const container = $('#tracker-container');
    if (!container) return;

    const tracked = getTrackedSet();
    const onlySchemes = schemesData.schemes.filter(s => s.type === 'scheme');

    const groups = { ending: [], active: [], upcoming: [], expired: [] };
    onlySchemes.forEach(s => groups[classifyScheme(s)].push(s));

    // Sort ending by fewest days; pinned first within each group
    const sortGroup = (arr, by) => {
      arr.sort((a, b) => {
        const at = tracked.has(a.id) ? 0 : 1;
        const bt = tracked.has(b.id) ? 0 : 1;
        if (at !== bt) return at - bt;
        if (by === 'ending') {
          return (daysUntil(a.validity?.endDate) ?? 999) - (daysUntil(b.validity?.endDate) ?? 999);
        }
        if (by === 'upcoming') {
          return (daysUntil(a.validity?.startDate) ?? 999) - (daysUntil(b.validity?.startDate) ?? 999);
        }
        return 0;
      });
    };
    sortGroup(groups.ending, 'ending');
    sortGroup(groups.upcoming, 'upcoming');
    sortGroup(groups.active);
    sortGroup(groups.expired);

    const sections = [
      { key: 'ending',   te: 'ముగుస్తున్నాయి', en: 'Ending Soon', emoji: '⏰', color: 'var(--warning)' },
      { key: 'active',   te: 'చురుకుగా ఉన్నాయి', en: 'Active', emoji: '✅', color: 'var(--success)' },
      { key: 'upcoming', te: 'రాబోయేవి', en: 'Upcoming', emoji: '🚀', color: 'var(--primary)' },
      { key: 'expired',  te: 'ముగిసినవి', en: 'Expired', emoji: '🚫', color: 'var(--danger)' }
    ];

    container.innerHTML = sections.map(sec => {
      const arr = groups[sec.key];
      const header = `
        <div class="tracker-section-header" style="border-left-color:${sec.color};">
          <span class="tsh-emoji">${sec.emoji}</span>
          <div>
            <div class="tsh-te" lang="te">${sec.te}</div>
            <div class="tsh-en" lang="en">${sec.en} (${arr.length})</div>
          </div>
        </div>`;
      if (!arr.length) {
        return header + `<div class="tracker-empty"><span lang="te">ఏదీ లేదు</span> · <span lang="en">None</span></div>`;
      }
      return header + `<div class="tracker-list">${arr.map(s => renderTrackerCard(s, sec.key, tracked.has(s.id))).join('')}</div>`;
    }).join('');

    // Event delegation for star toggle + checklist button
    container.onclick = (e) => {
      const star = e.target.closest('[data-action="toggle-track"]');
      if (star) { e.stopPropagation(); toggleTracked(star.dataset.id); return; }
      const cl = e.target.closest('[data-action="open-checklist"]');
      if (cl) { currentChecklistSchemeId = cl.dataset.id; showScreen('checklist'); return; }
    };
  }

  function renderTrackerCard(s, kind, isTracked) {
    const v = s.validity || {};
    let countdown = '';
    let badgeText = '';
    let badgeColor = 'var(--success)';
    let numColor = 'var(--success)';

    if (kind === 'ending') {
      const d = daysUntil(v.endDate);
      const big = d <= 7 ? 'var(--danger)' : 'var(--warning)';
      numColor = big;
      badgeColor = 'var(--warning)';
      badgeText = `<span lang="te">ముగుస్తోంది</span> · Ending`;
      countdown = `<div class="tc-count" style="color:${big};">${d}</div>
        <div class="tc-count-label"><span lang="te">రోజులు మిగిలాయి</span><br><span lang="en">days remaining</span></div>`;
    } else if (kind === 'upcoming') {
      numColor = 'var(--primary)';
      badgeColor = 'var(--primary)';
      if (v.notLaunched) {
        badgeText = `<span lang="te">త్వరలో</span> · Not Yet Launched`;
        countdown = `<div class="tc-count" style="color:var(--primary);font-size:22px;">TBA</div>
          <div class="tc-count-label"><span lang="te">ప్రకటించబడలేదు</span><br><span lang="en">date not announced</span></div>`;
      } else {
        const d = daysUntil(v.startDate);
        badgeText = `<span lang="te">రాబోయేది</span> · Upcoming`;
        countdown = `<div class="tc-count" style="color:var(--primary);">${d}</div>
          <div class="tc-count-label"><span lang="te">రోజుల్లో ప్రారంభం</span><br><span lang="en">days to start</span></div>`;
      }
    } else if (kind === 'expired') {
      const d = Math.abs(daysUntil(v.endDate));
      badgeColor = 'var(--danger)';
      badgeText = `<span lang="te">ముగిసింది</span> · Expired`;
      countdown = `<div class="tc-count" style="color:var(--danger);">−${d}</div>
        <div class="tc-count-label"><span lang="en">days ago</span></div>`;
    } else {
      // active
      badgeColor = 'var(--success)';
      if (v.isOngoing) {
        badgeText = `<span lang="te">నిరంతరం</span> · Ongoing`;
        countdown = `<div class="tc-count" style="color:var(--success);font-size:22px;">∞</div>
          <div class="tc-count-label"><span lang="te">నిరంతరం</span></div>`;
      } else {
        const d = daysUntil(v.endDate);
        badgeText = `<span lang="te">చురుకుగా</span> · Active`;
        countdown = `<div class="tc-count" style="color:var(--success);">${d}</div>
          <div class="tc-count-label"><span lang="te">రోజులు మిగిలాయి</span></div>`;
      }
    }

    const dateLine = v.notLaunched
      ? `<span lang="te">ప్రారంభ తేదీ ప్రకటించబడలేదు</span> · Launch date TBA`
      : v.isOngoing
      ? `<span lang="te">ప్రారంభం:</span> ${v.startDate || '—'} · <span lang="te">నిరంతరం</span>${v.note ? ' · ' + v.note : ''}`
      : `${v.startDate || '—'} → ${v.endDate || '—'}${v.note ? ' · ' + v.note : ''}`;

    return `
      <div class="tracker-card ${kind}">
        <button class="card-star ${isTracked ? 'tracked' : ''}" data-action="toggle-track" data-id="${s.id}" aria-label="Toggle save">${isTracked ? '★' : '☆'}</button>
        <div class="tc-main">
          <div class="tc-head">
            <span class="tc-icon">${s.icon}</span>
            <div class="tc-titles">
              <div class="tc-te" lang="te">${s.nameTe}</div>
              <div class="tc-en" lang="en">${s.nameEn}</div>
            </div>
          </div>
          <div class="tc-badge" style="background:${badgeColor};">${badgeText}</div>
          <div class="tc-dates">${dateLine}</div>
          <button class="tc-cta" data-action="open-checklist" data-id="${s.id}">
            <span lang="te">చెక్‌లిస్ట్ చూడండి</span> · View Checklist
          </button>
        </div>
        <div class="tc-countdown">${countdown}</div>
      </div>`;
  }

  // ========== GLOBAL EXPOSURES ==========
  window.app = {
    showScreen,
    setCategory,
    searchSchemes,
    openSchemeModal,
    closeModal,
    submitEligibility,
    resetEligibilityForm,
    viewChecklist,
    setToggle,
    toggleDocCheck,
    speakDoc,
    shareChecklist,
    openServiceChecklist,
    saveProfile,
    findMyEligibleSchemes,
    toggleVoice,
    installApp,
    dismissInstall,
    dismissStaleBanner,
    setupAdminAccess,
    verifyPin,
    closeAdminPanel,
    editSchemeOverride,
    saveSchemeOverride,
    resetAllOverrides,
    navigateToCategory,
    toggleTracked,
    showToast,
    // Login / session
    switchLoginTab,
    loginPersonal,
    loginAdmin,
    loginGuest,
    logout,
    openAdminPanel,
    // Admin extras
    showAddScheme,
    saveNewScheme,
    showChangePin,
    saveNewPin
  };

  // ========== STARTUP ==========
  document.addEventListener('DOMContentLoaded', init);

})();

