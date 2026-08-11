(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GiftagramModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const FUNNEL_KEYS = [
    'rawContacts','eligibleContacts','reachableContacts','positiveResponses',
    'meetingsBooked','meetingsHeld','qualifiedOpportunities','proposals','wins',
    'pipelineValue','proposalValue','revenue'
  ];

  const n = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const rate = (value) => Math.min(1, Math.max(0, n(value)));
  const round = (value) => Math.round((value + Number.EPSILON) * 10000) / 10000;

  function modelLane(lane, periodMonths = 1, conversionFactor = 1) {
    const months = Math.max(0, n(periodMonths, 1));
    const factor = Math.max(0, n(conversionFactor, 1));
    const adjusted = (key) => rate(rate(lane[key]) * factor);
    const rawContacts = Math.max(0, n(lane.unitsPerMonth)) * Math.max(0, n(lane.contactsPerUnit, 1)) * months;
    const eligibleContacts = rawContacts * rate(lane.eligibleRate);
    const reachableContacts = eligibleContacts * rate(lane.reachableRate);
    const positiveResponses = reachableContacts * adjusted('responseRate');
    const meetingsBooked = positiveResponses * adjusted('bookingRate');
    const meetingsHeld = meetingsBooked * adjusted('showRate');
    const qualifiedOpportunities = meetingsHeld * adjusted('qualificationRate');
    const proposals = qualifiedOpportunities * adjusted('proposalRate');
    const wins = proposals * adjusted('winRate');
    const avgDealValue = Math.max(0, n(lane.avgDealValue));
    return Object.fromEntries(Object.entries({
      rawContacts,
      eligibleContacts,
      reachableContacts,
      positiveResponses,
      meetingsBooked,
      meetingsHeld,
      qualifiedOpportunities,
      proposals,
      wins,
      pipelineValue: qualifiedOpportunities * avgDealValue,
      proposalValue: proposals * avgDealValue,
      revenue: wins * avgDealValue,
    }).map(([key, value]) => [key, round(value)]));
  }

  function combineOutcomes(outcomes) {
    const total = Object.fromEntries(FUNNEL_KEYS.map(key => [key, 0]));
    for (const outcome of outcomes || []) {
      for (const key of FUNNEL_KEYS) total[key] += n(outcome && outcome[key]);
    }
    for (const key of FUNNEL_KEYS) total[key] = round(total[key]);
    return total;
  }

  function goalSeekUnits(lane, targetRevenue, periodMonths = 1, conversionFactor = 1) {
    const oneUnit = modelLane({...lane, unitsPerMonth: 1}, periodMonths, conversionFactor).revenue;
    if (oneUnit <= 0) return Infinity;
    return Math.ceil(Math.max(0, n(targetRevenue)) / oneUnit);
  }

  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    const input = String(text || '').replace(/^\uFEFF/, '');
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (quoted) {
        if (ch === '"' && input[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
      else field += ch;
    }
    if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
    if (!rows.length) return [];
    const headers = rows.shift().map((h, i) => String(h || `column_${i + 1}`).trim());
    return rows.filter(r => r.some(v => String(v).trim())).map(values =>
      Object.fromEntries(headers.map((header, i) => [header, values[i] == null ? '' : values[i]]))
    );
  }

  function toCSV(rows) {
    if (!rows || !rows.length) return '';
    const headers = Array.from(rows.reduce((set, row) => {
      Object.keys(row || {}).forEach(key => set.add(key));
      return set;
    }, new Set()));
    const escape = value => {
      const text = value == null ? '' : String(value);
      return /[",\n\r]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
    };
    return [headers.map(escape).join(','), ...rows.map(row => headers.map(header => escape(row[header])).join(','))].join('\n');
  }

  function daysBetween(dateValue, now) {
    if (!dateValue) return Infinity;
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return Infinity;
    return Math.max(0, (now.getTime() - date.getTime()) / 86400000);
  }

  function classifyHubSpotRow(row, map, now = new Date()) {
    const get = key => String(row && map && map[key] ? row[map[key]] ?? '' : '').trim();
    const email = get('email'), company = get('company');
    if (!email || !company) return 'data_cleanup';
    const lifecycle = get('lifecycle').toLowerCase();
    const deal = get('dealStage').toLowerCase();
    const days = daysBetween(get('lastActivity'), now);
    if (/customer|evangelist|closed.?won/.test(lifecycle) || /closed.?won/.test(deal)) return 'expansion';
    if (deal && !/closed.?lost|disqualified/.test(deal) && days > 90) return 'dormant_opportunity';
    if (days <= 180) return 'warm_reactivation';
    return 'nurture';
  }

  function segmentRows(rows, map, now = new Date()) {
    const counts = {};
    const annotated = (rows || []).map(row => {
      const lane = classifyHubSpotRow(row, map, now);
      counts[lane] = (counts[lane] || 0) + 1;
      return {...row, salesfusion_lane: lane};
    });
    return {rows: annotated, counts};
  }

  const SIGNAL_RULES = {
    acquisition: {points: 25, buyers:['People / HR','Marketing / Communications','Business-unit leadership'], useCases:['Employee transition','Customer appreciation','Integration milestones']},
    hiring: {points: 24, buyers:['People / HR','Employee Experience'], useCases:['Employee onboarding','Recognition']},
    leadership: {points: 21, buyers:['People / HR','Executive leadership'], useCases:['Leadership welcome','Team recognition']},
    new_office: {points: 23, buyers:['People / HR','Workplace / Operations'], useCases:['Office opening','Employee welcome']},
    event: {points: 18, buyers:['Marketing','Sales','Customer Success'], useCases:['Event gifting','Strategic-account engagement']},
    customer_program: {points: 22, buyers:['Customer Experience','Marketing','Customer Success'], useCases:['Advocacy','Reviews and surveys','Client appreciation']},
    crm_engagement: {points: 20, buyers:['Known contact','Account owner'], useCases:['Reactivation','Expansion']},
    other: {points: 0, buyers:['Unresolved'], useCases:['Requires review']},
  };

  function scoreSignal(signal, now = new Date()) {
    const rule = SIGNAL_RULES[signal.type] || SIGNAL_RULES.other;
    const age = daysBetween(signal.signalDate, now);
    const recency = age <= 30 ? 30 : age <= 90 ? 20 : age <= 180 ? 10 : 0;
    const region = signal.region === 'north_america' ? 15 : signal.region === 'giftagram_supported' ? 12 : 0;
    const fit = Math.max(1, Math.min(5, n(signal.fit, 1))) * 4;
    const relationship = ({existing_opportunity:20, engaged:15, known_account:10, net_new:5}[signal.relationship] || 0);
    const score = Math.min(100, Math.round(rule.points + recency + region + fit + relationship));
    return {
      score,
      priority: score >= 75 ? 'P1' : score >= 50 ? 'P2' : 'HOLD',
      ageDays: Number.isFinite(age) ? Math.round(age) : null,
      buyers: rule.buyers.slice(),
      useCases: rule.useCases.slice(),
      rationale: [
        `${signal.type || 'Other'} signal`,
        Number.isFinite(age) ? `${Math.round(age)} days old` : 'date not verified',
        signal.region === 'north_america' ? 'North American fit' : 'region requires review',
        signal.relationship === 'existing_opportunity' ? 'existing opportunity' : String(signal.relationship || 'relationship unknown').replaceAll('_',' '),
      ],
    };
  }

  return {modelLane, combineOutcomes, goalSeekUnits, parseCSV, toCSV, classifyHubSpotRow, segmentRows, scoreSignal};
});
