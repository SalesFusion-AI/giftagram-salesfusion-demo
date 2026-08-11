(() => {
  'use strict';
  const M = window.GiftagramModel;
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const clone = x => JSON.parse(JSON.stringify(x));
  const defaults = {
    period:3, scenario:1,
    reactivation:{name:'HubSpot reactivation',unit:'records',unitsPerMonth:1000,contactsPerUnit:1,eligibleRate:.35,reachableRate:.8,responseRate:.05,bookingRate:.35,showRate:.8,qualificationRate:.45,proposalRate:.5,winRate:.25,avgDealValue:50000},
    netNew:{name:'Signal-led net new',unit:'accounts',unitsPerMonth:150,contactsPerUnit:2,eligibleRate:1,reachableRate:.75,responseRate:.035,bookingRate:.4,showRate:.8,qualificationRate:.45,proposalRate:.5,winRate:.25,avgDealValue:50000},
    economics:{monthlyFee:2500,otherMonthlyCost:1000,grossMargin:.4}
  };
  let state;
  try { state = {...clone(defaults), ...JSON.parse(localStorage.getItem('giftagramWorkbench')||'{}')}; state.reactivation={...defaults.reactivation,...state.reactivation}; state.netNew={...defaults.netNew,...state.netNew}; state.economics={...defaults.economics,...state.economics}; }
  catch { state=clone(defaults); }
  let csvRows=[], segmented=[];

  const laneFields = [
    ['unitsPerMonth','TOF · Monthly volume','number'],['contactsPerUnit','TOF · Contacts per unit','number'],
    ['eligibleRate','TOF · Eligible','percent'],['reachableRate','TOF · Reachable','percent'],
    ['responseRate','TOF → MOF · Positive response','percent'],['bookingRate','MOF · Response → meeting','percent'],
    ['showRate','MOF · Meeting show','percent'],['qualificationRate','MOF → BOF · Held → qualified','percent'],
    ['proposalRate','BOF · Qualified → proposal','percent'],['winRate','BOF · Proposal → win','percent'],
    ['avgDealValue','BOF · Average deal value','currency']
  ];
  const scenarioNames = {'0.8':'Conservative','1':'Expected','1.2':'Upside'};
  const funnelStages = [
    ['reachableContacts','Reachable'],['positiveResponses','Positive replies'],['meetingsBooked','Meetings booked'],
    ['meetingsHeld','Meetings held'],['qualifiedOpportunities','Qualified opps'],['proposals','Proposals'],['wins','Wins'],['revenue','Revenue']
  ];
  const laneInput = (laneKey) => {
    const lane=state[laneKey];
    return `<details class="lane" open><summary>${lane.name}<small>${lane.unit}/month</small></summary><div class="lanegrid">${laneFields.map(([key,label,type])=>{
      const raw=lane[key], val=type==='percent'?Math.round(raw*10000)/100:raw, step=type==='percent'?'0.1':type==='currency'?'1000':'1';
      return `<div class="field"><label>${label}</label><div class="suffix"><input type="number" min="0" ${type==='percent'?'max="100"':''} step="${step}" value="${val}" data-model="${laneKey}.${key}" data-type="${type}">${type==='percent'?'<span>%</span>':type==='currency'?'<span>CAD</span>':''}</div></div>`;
    }).join('')}</div></details>`;
  };
  function renderInputShell(){
    $('#laneInputs').innerHTML=laneInput('reactivation')+laneInput('netNew');
    $('#economicInputs').innerHTML=[['monthlyFee','SalesFusion / month','currency'],['otherMonthlyCost','Other costs / month','currency'],['grossMargin','Gross margin','percent']].map(([key,label,type])=>`<div class="field"><label>${label}</label><div class="suffix"><input type="number" min="0" ${type==='percent'?'max="100"':''} step="${type==='percent'?1:100}" value="${type==='percent'?state.economics[key]*100:state.economics[key]}" data-model="economics.${key}" data-type="${type}">${type==='percent'?'<span>%</span>':'<span>CAD</span>'}</div></div>`).join('');
    $$('[data-model]').forEach(input=>input.addEventListener('input',()=>{
      const [group,key]=input.dataset.model.split('.'); let val=Number(input.value)||0; if(input.dataset.type==='percent') val/=100; state[group][key]=val; persist(); updateModel(); updateGoal();
    }));
  }
  const fmtCount=v => v>=100?Math.round(v).toLocaleString('en-CA'):v>=10?v.toFixed(1):v.toFixed(2);
  const fmtMoney=v => new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0}).format(v||0);
  const fmtCompactMoney=v => new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',notation:'compact',maximumFractionDigits:1}).format(v||0);
  const persist=()=>localStorage.setItem('giftagramWorkbench',JSON.stringify(state));
  function outcomes(factor=state.scenario){return {reactivation:M.modelLane(state.reactivation,state.period,factor),netNew:M.modelLane(state.netNew,state.period,factor)}}
  function combined(factor=state.scenario){const o=outcomes(factor);return M.combineOutcomes([o.reactivation,o.netNew]);}
  function updateModel(){
    const total=combined(); const months=state.period; const cost=(state.economics.monthlyFee+state.economics.otherMonthlyCost)*months; const gross=total.revenue*state.economics.grossMargin; const net=gross-cost;
    $('#periodLabel').textContent=months===1?'1 month':months===3?'90 days':'12 months';
    $('#modelKpis').innerHTML=[['Reachable',total.reachableContacts,'count'],['Meetings',total.meetingsHeld,'count'],['Qualified',total.qualifiedOpportunities,'count'],['Pipeline',total.pipelineValue,'money'],['Expected revenue',total.revenue,'money']].map(([label,val,type])=>`<div class="kpi"><label>${label}</label><strong title="${type==='money'?fmtMoney(val):fmtCount(val)}">${type==='money'?fmtCompactMoney(val):fmtCount(val)}</strong><small>${scenarioNames[String(state.scenario)]} · ${months} mo</small></div>`).join('');
    $('#funnel').innerHTML=funnelStages.map(([key,label])=>`<div class="stage"><b title="${key==='revenue'?fmtMoney(total[key]):fmtCount(total[key])}">${key==='revenue'?fmtCompactMoney(total[key]):fmtCount(total[key])}</b><span>${label}</span></div>`).join('');
    $('#scenarioRows').innerHTML=[.8,1,1.2].map(f=>{const x=combined(f);return `<tr class="${f===state.scenario?'highlight':''}"><td>${scenarioNames[String(f)]}</td><td>${fmtCount(x.positiveResponses)}</td><td>${fmtCount(x.meetingsHeld)}</td><td>${fmtCount(x.qualifiedOpportunities)}</td><td>${fmtCount(x.proposals)}</td><td>${fmtCount(x.wins)}</td><td>${fmtMoney(x.revenue)}</td></tr>`}).join('');
    $('#economics').innerHTML=[['Engagement + tools',fmtMoney(cost)],['Gross profit modeled',fmtMoney(gross)],['Contribution after cost',fmtMoney(net)],['Gross-profit multiple',cost?`${(gross/cost).toFixed(1)}×`:'—']].map(([l,v])=>`<div class="econbox"><label>${l}</label><b>${v}</b></div>`).join('');
  }
  function updateGoal(){
    const target=Math.max(0,Number($('#goalRevenue')?.value)||0); if(!$('#goalLane')) return;
    const scaleKey=$('#goalLane').value, baseKey=scaleKey==='netNew'?'reactivation':'netNew';
    const base=M.modelLane(state[baseKey],state.period,state.scenario); const gap=Math.max(0,target-base.revenue); const required=M.goalSeekUnits(state[scaleKey],gap,state.period,state.scenario); const label=scaleKey==='netNew'?'accounts / month':'records / month';
    const adjusted={...state[scaleKey],unitsPerMonth:Number.isFinite(required)?required:0}; const scaled=M.modelLane(adjusted,state.period,state.scenario); const achieved=base.revenue+scaled.revenue;
    $('#goalResults').innerHTML=[['Existing lane contribution',fmtMoney(base.revenue)],['Required '+label,Number.isFinite(required)?required.toLocaleString('en-CA'):'Not solvable'],['Modeled outcome',fmtMoney(achieved)]].map(([l,v])=>`<div class="resultbox"><label>${l}</label><b>${v}</b></div>`).join('');
    const perUnit=M.modelLane({...state[scaleKey],unitsPerMonth:1},state.period,state.scenario).revenue;
    $('#goalFormula').textContent=`Target                         ${fmtMoney(target)}\nLess: other lane contribution  ${fmtMoney(base.revenue)}\nRemaining revenue gap          ${fmtMoney(gap)}\nRevenue per monthly ${state[scaleKey].unit.slice(0,-1)||'unit'}    ${fmtMoney(perUnit)}\n────────────────────────────────────────\nRequired monthly TOF volume    ${Number.isFinite(required)?required.toLocaleString('en-CA'):'∞'} ${label}`;
  }

  function switchView(name){$$('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.view===name));$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`)); if(name==='goal')updateGoal(); if(name==='signal')updateSignal(); if(name==='campaign')updateCampaign();}
  $$('.navbtn').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
  $$('#periodControl button').forEach(b=>{b.classList.toggle('active',Number(b.dataset.period)===state.period);b.addEventListener('click',()=>{state.period=Number(b.dataset.period);$$('#periodControl button').forEach(x=>x.classList.toggle('active',x===b));persist();updateModel();updateGoal();});});
  $('#scenarioSelect').value=String(state.scenario); $('#scenarioSelect').addEventListener('change',e=>{state.scenario=Number(e.target.value);persist();updateModel();updateGoal();});
  $('#goalRevenue').addEventListener('input',updateGoal); $('#goalLane').addEventListener('change',updateGoal);
  $('#resetBtn').addEventListener('click',()=>{if(!confirm('Reset all model assumptions to the demo defaults?'))return;state=clone(defaults);persist();renderInputShell();$('#scenarioSelect').value='1';$$('#periodControl button').forEach(b=>b.classList.toggle('active',Number(b.dataset.period)===3));updateModel();updateGoal();toast('Assumptions reset');});

  const sample=`email,company,lifecyclestage,dealstage,last_activity_date,jobtitle\nava@example.com,Northstar Foods,opportunity,proposal,2026-02-04,VP People\nben@example.com,Maple Systems,customer,closedwon,2026-07-20,Head of Customer Success\n,Clearline Health,lead,,2026-05-10,Director HR\ndev@example.com,Peak Digital,lead,,2026-07-02,VP Marketing\neli@example.com,Harbour Labs,subscriber,,2024-09-13,People Ops\nfay@example.com,Veridian Group,opportunity,qualifiedtobuy,2026-03-01,Chief People Officer\ngia@example.com,Atlas Works,lead,,2026-08-01,Director Employee Experience\nhal@example.com,,lead,,2026-06-01,VP Sales`;
  const detect=(headers,patterns)=>headers.find(h=>patterns.some(p=>p.test(h.toLowerCase())))||'';
  function loadCsv(text){try{csvRows=M.parseCSV(text);if(!csvRows.length)throw Error('No rows found');const h=Object.keys(csvRows[0]);const map={email:detect(h,[/^email$/,/email.address/]),company:detect(h,[/^company$/,/company.name/]),lifecycle:detect(h,[/lifecycle/]),dealStage:detect(h,[/deal.?stage/]),lastActivity:detect(h,[/last.*activity/,/last.*contact/])};renderMapping(h,map);$('#segmentWorkspace').classList.remove('hidden');updateSegments();}catch(e){alert(`Could not read CSV: ${e.message}`)}}
  function renderMapping(headers,map){const labels={email:'Email',company:'Company',lifecycle:'Lifecycle stage',dealStage:'Deal stage',lastActivity:'Last activity'};$('#mapping').innerHTML=Object.entries(labels).map(([key,label])=>`<div class="field"><label>${label}</label><select data-map="${key}"><option value="">Not mapped</option>${headers.map(h=>`<option ${h===map[key]?'selected':''}>${escapeHtml(h)}</option>`).join('')}</select></div>`).join('');$$('[data-map]').forEach(s=>s.addEventListener('change',updateSegments));}
  function currentMap(){return Object.fromEntries($$('[data-map]').map(s=>[s.dataset.map,s.value]));}
  const laneLabels={dormant_opportunity:'Dormant opportunity',warm_reactivation:'Warm reactivation',expansion:'Expansion',nurture:'Nurture',data_cleanup:'Data cleanup'};
  function updateSegments(){const result=M.segmentRows(csvRows,currentMap(),new Date());segmented=result.rows;$('#segmentCounts').innerHTML=Object.keys(laneLabels).map(k=>`<div class="count"><b>${result.counts[k]||0}</b><span>${laneLabels[k]}</span></div>`).join('');$('#rowSummary').textContent=`${csvRows.length.toLocaleString()} rows processed · previewing first ${Math.min(12,csvRows.length)}`;const cols=[...Object.keys(csvRows[0]||{}).slice(0,5),'salesfusion_lane'];$('#previewHead').innerHTML=`<tr>${cols.map(c=>`<th>${escapeHtml(c)}</th>`).join('')}</tr>`;$('#previewBody').innerHTML=segmented.slice(0,12).map(r=>`<tr>${cols.map(c=>`<td>${escapeHtml(r[c]||'')}</td>`).join('')}</tr>`).join('');}
  $('#chooseCsv').addEventListener('click',()=>$('#csvFile').click());$('#sampleCsv').addEventListener('click',()=>loadCsv(sample));$('#csvFile').addEventListener('change',e=>{const f=e.target.files[0];if(f)f.text().then(loadCsv)});const dz=$('#dropzone');['dragenter','dragover'].forEach(x=>dz.addEventListener(x,e=>{e.preventDefault();dz.classList.add('drag')}));['dragleave','drop'].forEach(x=>dz.addEventListener(x,e=>{e.preventDefault();dz.classList.remove('drag')}));dz.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];if(f)f.text().then(loadCsv)});$('#downloadSegmented').addEventListener('click',()=>download('giftagram-hubspot-segments.csv',M.toCSV(segmented),'text/csv'));

  const sigIds=['sigAccount','sigType','sigDate','sigRegion','sigFit','sigRelationship','sigSource','sigDescription']; sigIds.forEach(id=>$('#'+id).addEventListener('input',updateSignal));
  function signalData(){return {account:$('#sigAccount').value.trim(),type:$('#sigType').value,signalDate:$('#sigDate').value,region:$('#sigRegion').value,fit:Number($('#sigFit').value),relationship:$('#sigRelationship').value,source:$('#sigSource').value.trim(),description:$('#sigDescription').value.trim()}}
  function updateSignal(){const s=signalData(),r=M.scoreSignal(s,new Date());$('#sigScore').textContent=r.score;$('#scoreDial').style.setProperty('--score',`${r.score*3.6}deg`);$('#sigPriority').textContent=r.priority;$('#sigHeadline').textContent=s.account?`${s.account} · ${r.priority}`:'Add an account to complete the object';$('#sigRationale').textContent=r.rationale.join(' · ');$('#sigBuyers').innerHTML=r.buyers.map(x=>`<li>${escapeHtml(x)}</li>`).join('');$('#sigUseCases').innerHTML=r.useCases.map(x=>`<li>${escapeHtml(x)}</li>`).join('');$('#sigBrief').textContent=`ACCOUNT\n${s.account||'Not set'}\n\nVERIFIED TRIGGER\n${s.description||'Not set'}\n\nSCORE / ROUTE\n${r.score}/100 · ${r.priority}\n${r.buyers.join(' → ')}\n\nGIFTAGRAM HYPOTHESIS\n${r.useCases.join(' · ')}\n\nSOURCE\n${s.source||'Source required'}\n\nAPPROVAL STATE\nResearch only · contact verification, CRM history, suppression and message approval still required.`;}
  $('#loadAzz').addEventListener('click',()=>{const v={sigAccount:'AZZ Inc.',sigType:'acquisition',sigDate:'2026-07-30',sigRegion:'north_america',sigFit:'4',sigRelationship:'net_new',sigSource:'https://investors.azz.com/news-releases/news-release-details/azz-inc-acquires-seattle-galvanizing-company',sigDescription:'AZZ acquired Seattle Galvanizing, adding two Washington facilities, and publicly welcomed the acquired company’s employees and customers.'};Object.entries(v).forEach(([id,val])=>$('#'+id).value=val);updateSignal();});

  const cellIds=['cellSegment','cellSignal','cellUseCase','cellBuyer','cellProof','cellCta'];cellIds.forEach(id=>$('#'+id).addEventListener('input',updateCampaign));
  function campaignText(){const v=Object.fromEntries(cellIds.map(id=>[id,$('#'+id).value.trim()]));return `Segment: ${v.cellSegment}\nSignal: ${v.cellSignal}\nUse case: ${v.cellUseCase}\nBuyer: ${v.cellBuyer}\nProof: ${v.cellProof}\nCTA: ${v.cellCta}\n\nHypothesis: ${v.cellBuyer} accounts in ${v.cellSegment} that show ${v.cellSignal.toLowerCase()} will respond to a specific ${v.cellUseCase.toLowerCase()} conversation when supported by ${v.cellProof}.\n\nGate: research complete → contacts verified → CRM/suppression clear → copy approved → owner assigned.`}
  function updateCampaign(){const labels=[['Segment','cellSegment'],['Trigger','cellSignal'],['Use case','cellUseCase'],['Buyer','cellBuyer'],['Proof','cellProof'],['CTA','cellCta']];$('#cellId').textContent='CELL-'+String(hash(campaignText())).slice(-5);$('#cellOutput').innerHTML=labels.map(([l,id])=>`<div class="cellrow"><label>${l}</label><span>${escapeHtml($('#'+id).value)}</span></div>`).join('')+`<div class="cellrow"><label>Hypothesis</label><span>${escapeHtml(campaignText().split('\n\n')[1].replace('Hypothesis: ',''))}</span></div>`;}
  $('#copyCell').addEventListener('click',()=>navigator.clipboard.writeText(campaignText()).then(()=>toast('Campaign brief copied')));

  function hash(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return Math.abs(h)}
  function escapeHtml(v){return String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
  function download(name,content,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
  function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1600)}

  renderInputShell();updateModel();updateGoal();updateSignal();updateCampaign();
})();
