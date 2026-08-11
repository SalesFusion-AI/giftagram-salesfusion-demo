const test = require('node:test');
const assert = require('node:assert/strict');

const {
  modelLane,
  combineOutcomes,
  goalSeekUnits,
  parseCSV,
  toCSV,
  classifyHubSpotRow,
  segmentRows,
  scoreSignal,
} = require('../model.js');

const lane = {
  unitsPerMonth: 100,
  contactsPerUnit: 2,
  eligibleRate: 0.50,
  reachableRate: 0.80,
  responseRate: 0.10,
  bookingRate: 0.50,
  showRate: 0.80,
  qualificationRate: 0.50,
  proposalRate: 0.50,
  winRate: 0.50,
  avgDealValue: 10000,
};

test('modelLane carries volume through TOF, MOF and BOF', () => {
  const out = modelLane(lane, 1, 1);
  assert.equal(out.rawContacts, 200);
  assert.equal(out.eligibleContacts, 100);
  assert.equal(out.reachableContacts, 80);
  assert.equal(out.positiveResponses, 8);
  assert.equal(out.meetingsBooked, 4);
  assert.equal(out.meetingsHeld, 3.2);
  assert.equal(out.qualifiedOpportunities, 1.6);
  assert.equal(out.proposals, 0.8);
  assert.equal(out.wins, 0.4);
  assert.equal(out.pipelineValue, 16000);
  assert.equal(out.proposalValue, 8000);
  assert.equal(out.revenue, 4000);
});

test('modelLane scales volume by period and applies a conversion scenario factor', () => {
  const out = modelLane(lane, 3, 0.5);
  assert.equal(out.rawContacts, 600);
  assert.equal(out.positiveResponses, 12);
  assert.equal(out.revenue, 187.5);
});

test('combineOutcomes sums two modeled lanes without losing funnel stages', () => {
  const a = modelLane(lane, 1, 1);
  const b = modelLane({...lane, unitsPerMonth: 50}, 1, 1);
  const total = combineOutcomes([a, b]);
  assert.equal(total.rawContacts, 300);
  assert.equal(total.wins, 0.6);
  assert.equal(total.revenue, 6000);
});

test('goalSeekUnits returns required monthly units to reach a period revenue target', () => {
  assert.equal(goalSeekUnits(lane, 100000, 3, 1), 834);
});

test('parseCSV supports quoted commas and escaped quotes', () => {
  const rows = parseCSV('email,company,note\na@example.com,"Acme, Inc.","Said ""hello"""');
  assert.deepEqual(rows, [{email:'a@example.com', company:'Acme, Inc.', note:'Said "hello"'}]);
});

test('toCSV escapes commas and quotes and round-trips through parseCSV', () => {
  const source = [{email:'a@example.com', company:'Acme, Inc.', note:'Said "hello"'}];
  assert.deepEqual(parseCSV(toCSV(source)), source);
});

test('classifyHubSpotRow separates cleanup, expansion, dormant, warm and nurture rows', () => {
  const map = {email:'email', company:'company', lifecycle:'lifecycle', dealStage:'dealstage', lastActivity:'last'};
  const now = new Date('2026-08-11T00:00:00Z');
  assert.equal(classifyHubSpotRow({email:'',company:'A'}, map, now), 'data_cleanup');
  assert.equal(classifyHubSpotRow({email:'a@a.com',company:'A',lifecycle:'customer'}, map, now), 'expansion');
  assert.equal(classifyHubSpotRow({email:'a@a.com',company:'A',dealstage:'proposal',last:'2026-01-01'}, map, now), 'dormant_opportunity');
  assert.equal(classifyHubSpotRow({email:'a@a.com',company:'A',last:'2026-06-15'}, map, now), 'warm_reactivation');
  assert.equal(classifyHubSpotRow({email:'a@a.com',company:'A',last:'2024-01-01'}, map, now), 'nurture');
});

test('segmentRows annotates every row and returns lane counts', () => {
  const map = {email:'email', company:'company', lifecycle:'lifecycle', dealStage:'dealstage', lastActivity:'last'};
  const now = new Date('2026-08-11T00:00:00Z');
  const result = segmentRows([
    {email:'a@a.com',company:'A',lifecycle:'customer'},
    {email:'',company:'B'},
    {email:'c@c.com',company:'C',last:'2026-06-15'},
  ], map, now);
  assert.equal(result.rows.length, 3);
  assert.deepEqual(result.counts, {expansion:1, data_cleanup:1, warm_reactivation:1});
});

test('scoreSignal rewards recent acquisition signals, North American fit and known relationships', () => {
  const result = scoreSignal({
    type:'acquisition',
    signalDate:'2026-08-01',
    region:'north_america',
    fit:5,
    relationship:'existing_opportunity',
  }, new Date('2026-08-11T00:00:00Z'));
  assert.equal(result.score, 100);
  assert.equal(result.priority, 'P1');
  assert.ok(result.buyers.includes('People / HR'));
  assert.ok(result.useCases.includes('Employee transition'));
});

test('scoreSignal holds stale, low-fit signals', () => {
  const result = scoreSignal({
    type:'other',
    signalDate:'2024-01-01',
    region:'other',
    fit:1,
    relationship:'net_new',
  }, new Date('2026-08-11T00:00:00Z'));
  assert.equal(result.priority, 'HOLD');
  assert.ok(result.score < 40);
});
