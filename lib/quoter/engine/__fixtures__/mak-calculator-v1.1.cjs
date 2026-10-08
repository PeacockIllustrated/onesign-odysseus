/* eslint-disable */
// Mak's original sign calculator engine (onesign-calculator.html, price book v1.1),
// extracted verbatim so panel_letters_v2 can be held to it in tests. Do not edit.
const HEIGHTS = [50,100,150,200,250,300,350,400,450,500,550,600,650,700,750,800,850,900,950,1000];

/* ---------- default price book ---------------------------- */
function defaultPriceBook(){
  return {
    version: '1.1',
    schema: 2,
    updated: new Date().toISOString().slice(0,10),
    updatedBy: '',

    /* Sheet materials. Add a row here and it appears in the
       calculator immediately — no code change needed.       */
    sheets: [
      { material:'Aluminium 2.5mm', w:2440, h:1220, price:61,  use:'panel',    active:true },
      { material:'Aluminium 2.5mm', w:3000, h:1500, price:87,  use:'panel',    active:true },
      { material:'Dibond 3mm',      w:2440, h:1220, price:23,  use:'panel',    active:false },
      { material:'Opal 5mm',        w:2440, h:1220, price:88,  use:'aperture', active:true },
      { material:'Opal 10mm',       w:2440, h:1220, price:120, use:'aperture', active:true }
    ],

    panelFinishes: [
      { name:'None',            costPerM2:0 },
      { name:'Powder coating',  costPerM2:25.4 }
    ],

    labour: [
      { op:'Router',           rate:94 },
      { op:'Fabrication',      rate:65 },
      { op:'Assembly',         rate:65 },
      { op:'Vinyl',            rate:90 },
      { op:'Digital printing', rate:90 }
    ],

    heights: HEIGHTS.slice(),

    /* Letter prices are SELL prices — markup is already baked
       into these tables (as it was in the spreadsheet).      */
    letterTypes: [
      { name:'Fabricated', finishes:[
        { name:'Unfinished',    prices:[58.3,59.4,60.5,61.6,63.8,78.1,80.3,83.6,92.4,96.8,105.05,112.2,119.35,128.7,135.85,156.2,164.45,172.7,180.95,189.2] },
        { name:'Powder coated', prices:[63.404,67.936,73.326,75.636,79.068,94.908,98.648,104.192,115.302,123.046,134.838,144.254,153.714,165.638,175.846,197.802,210.848,221.804,233.178,244.156] },
        { name:'Wet paint',     prices:[65.406,70.07,76.406,79.134,82.852,99.088,103.202,109.406,121,129.602,142.274,152.262,162.294,174.9,187.88,213.224,222.42,234.124,246.224,255.706] }
      ]},
      { name:'Komacel', finishes:[
        { name:'Unfinished',     prices:[17.05,20.878,24.706,28.556,35.266,41.998,48.708,59.84,65.78,89.32,101.86,114.4,134.2,154,173.8,193.6,213.4,233.2,253,272.8] },
        { name:'Face fitted',    prices:[20.68,28.138,35.002,41.888,54.164,66.484,78.76,95.48,111.474,145.09,167.134,190.3,226.05,261.8,297,332.2,367.664,403.15,438.614,474.1] },
        { name:'Rim and return', prices:[23.98,34.738,44.902,55.088,70.664,86.284,101.86,121.88,141.174,178.09,203.434,229.9,268.95,308,346.5,385,423.764,462.55,501.314,540.1] }
      ]},
      { name:'Acrylic', finishes:[
        { name:'Unfinished',     prices:[12.4,15.184,17.968,20.768,25.648,30.544,35.424,43.52,47.84,64.96,74.08,83.2,97.6,112,126.4,140.8,155.2,169.6,184,198.4] },
        { name:'Face fitted',    prices:[15.04,20.464,25.456,30.464,39.392,48.352,57.28,69.44,81.072,105.52,121.552,138.4,164.4,190.4,216,241.6,267.392,293.2,318.992,344.8] },
        { name:'Rim and return', prices:[17.44,25.264,32.656,40.064,51.392,62.752,74.08,88.64,102.672,129.52,147.952,167.2,195.6,224,252,280,308.192,336.4,364.592,392.8] }
      ]}
    ],

    /* Per-letter illumination. costPerLetter is a SELL price
       (material at +100%, LEDs at +300%, as per the sheet).  */
    illumination: {
      ledsPerLetter: [2,3,5,7,9,12,14,15,17,18,20,21,28,36,43,51,54,57,59,62],
      costPerLetter: [9.43,11.7,14.76,18.56,21.72571429,26.26285714,31.12,38.2,46.79692308,53.08,60.95,71.36,86.88,107.26,133.88,143.16,183.64,187.12,189.44,192.92]
    },

    transformers: [
      { name:'20W',  maxLeds:40,  price:28.88 },
      { name:'60W',  maxLeds:120, price:32.24 },
      { name:'100W', maxLeds:200, price:50.82 },
      { name:'150W', maxLeds:300, price:88.94 }
    ],

    settings: {
      markupPct: 60,            // on panel, finish, aperture, transformers
      vatPct: 20,
      apertureLedGridMm: 200,   // one LED per 200 x 200 cell
      apertureLedUnitCost: 0.29,
      apertureLedMarkupPct: 0,  // sheet applied none here; letters get 300%
      heightPolicy: 'roundup',  // roundup | nearest | block
      cuttingPriority: 'joins', // joins | cost
      jointAllowanceHrs: 1.5    // fabrication hrs added per join
    }
  };
}

/* ---------- helpers --------------------------------------- */
const money = n => (n<0?'-':'') + '£' + Math.abs(n).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
const num   = (n,d=2) => Number(n||0).toLocaleString('en-GB',{minimumFractionDigits:d,maximumFractionDigits:d});
const uid   = () => Math.random().toString(36).slice(2,9);
const esc   = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ----------------------------------------------------------
   Nesting. A tray is cut from sheet as strips: a run of
   length L and height H. Several strips can come off one
   sheet stacked on top of each other, and long runs are
   joined end to end. So 4100 x 600 gets two 2440 strips
   stacked on a single 2440 x 1220 sheet — one sheet, one
   join — rather than two sheets as a naive grid would say.
   Both panel orientations and both sheet orientations are
   tried; fewest sheets wins, then fewest joins.
---------------------------------------------------------- */
function nestOptions(w, h, sw, sh){
  const out = [];
  [[w,h],[h,w]].forEach(([L,H]) => {
    [[sw,sh],[sh,sw]].forEach(([SL,SH]) => {
      const perSheet = Math.floor(SH / H);          // strips stacked per sheet
      if (perSheet < 1) return;                     // too tall this way round
      const pieces = Math.ceil(L / SL);             // lengths joined end to end
      out.push({ sheets:Math.ceil(pieces/perSheet), pieces, joins:pieces-1,
                 stripLen:SL, stripH:H, perSheet, run:L, fallback:false });
    });
  });
  if (!out.length){                                 // too big both ways: grid it
    const a = Math.ceil(w/sw) * Math.ceil(h/sh);
    const b = Math.ceil(w/sh) * Math.ceil(h/sw);
    const sheets = Math.min(a,b);
    out.push({ sheets, pieces:sheets, joins:sheets-1, stripLen:sw, stripH:sh,
               perSheet:1, run:w, fallback:true });
  }
  return out;
}

function nestWords(n, sheet){
  if (n.fallback) return `too large to strip cleanly — gridded into ${n.sheets} sheets`;
  if (n.pieces === 1) return `one piece, ${num(n.run,0)} x ${num(n.stripH,0)}mm, from a ${sheet.w} x ${sheet.h} sheet`;
  return `${n.pieces} pieces of up to ${num(n.stripLen,0)}mm joined end to end · ${n.perSheet} strip${n.perSheet===1?'':'s'} of ${num(n.stripH,0)}mm per sheet · ${n.sheets} sheet${n.sheets===1?'':'s'}, ${n.joins} join${n.joins===1?'':'s'}`;
}

/* Resolve a letter height onto a priced band. */
function resolveBand(height, heights, policy){
  const exact = heights.indexOf(height);
  if (exact !== -1) return { i:exact, band:height, exact:true, over:false };
  const max = heights[heights.length-1];
  if (height > max){
    return { i:heights.length-1, band:max, exact:false, over:true };
  }
  if (policy === 'block') return { i:-1, band:null, exact:false, over:false };
  if (policy === 'nearest'){
    let best = 0, d = Infinity;
    heights.forEach((v,i)=>{ const dd = Math.abs(v-height); if (dd < d){ d = dd; best = i; } });
    return { i:best, band:heights[best], exact:false, over:false };
  }
  for (let i=0;i<heights.length;i++) if (heights[i] > height) return { i, band:heights[i], exact:false, over:false };
  return { i:heights.length-1, band:max, exact:false, over:false };
}

/* Linear extrapolation beyond the top band, per 50mm. */
function overshootFactor(height, heights){
  const max = heights[heights.length-1];
  return height > max ? height / max : 1;
}

/* ---------- the engine ------------------------------------
   Returns a full audit trail alongside the numbers. Every
   figure on screen can be traced back to a price book row.
----------------------------------------------------------- */
function costSign(sign, pb){
  const S  = pb.settings;
  const tr = [];                                  // trace lines
  const warn = [];
  const g = (group,lab,work,val,opts={}) => tr.push(Object.assign({group,lab,work,val},opts));

  const markupPct = (sign.markupPct === null || sign.markupPct === undefined) ? S.markupPct : sign.markupPct;

  /* --- 1. panel ------------------------------------------ */
  const faceW = +sign.panel.width || 0;
  const faceH = +sign.panel.height || 0;
  const ret   = +sign.panel.returns || 0;
  const devW  = faceW + 2*ret;
  const devH  = faceH + 2*ret;
  const devArea = (devW/1000) * (devH/1000);

  g('Panel','Face size', `${num(faceW,0)} x ${num(faceH,0)} mm`, null);
  g('Panel','Flat development', `${num(faceW,0)} + 2 x ${num(ret,0)} = ${num(devW,0)} mm  ·  ${num(faceH,0)} + 2 x ${num(ret,0)} = ${num(devH,0)} mm`, null);
  g('Panel','Material area', `${num(devW/1000,3)} x ${num(devH/1000,3)} = ${num(devArea,4)} m²`, null);

  const opts = pb.sheets.filter(s => s.active && s.use === 'panel' && s.material === sign.panel.material);
  let panelCost = 0, sheetsUsed = 0, panelJoins = 0, chosen = null, sheetLabel = '—', sheetPrice = 0;

  /* Always run the tray along the length of the sheet. Chopping it
     into short pieces to squeeze onto one sheet means more welds,
     a weaker tray and a worse finish, so plans are ranked on the
     fewest joins first and money second. Switch the priority to
     'cost' in the price book to rank purely on total cost. */
  const fabRate  = (pb.labour.find(l => /fabricat/i.test(l.op)) || { rate:0 }).rate;
  const joinCost = (S.jointAllowanceHrs || 0) * fabRate;

  if (!(faceW > 0 && faceH > 0)){
    warn.push('No panel size entered — panel not priced.');
  } else if (!opts.length){
    warn.push(`No active panel sheet sizes for "${sign.panel.material}". Add one in the price book.`);
    g('Panel','Panel cost','no priced sheet available',0);
  } else {
    let scored = [];
    opts.forEach(s => nestOptions(devW, devH, s.w, s.h).forEach(n => {
      const cost = n.sheets * s.price;
      scored.push({ s, n, cost, joinLabour:n.joins * joinCost, all:cost + n.joins * joinCost,
                    waste:(n.sheets * s.w * s.h / 1e6) - devArea });
    }));
    scored.sort(S.cuttingPriority === 'cost'
      ? (a,b) => a.all - b.all || a.n.joins - b.n.joins || a.n.sheets - b.n.sheets || a.waste - b.waste
      : (a,b) => a.n.joins - b.n.joins || a.all - b.all || a.n.sheets - b.n.sheets || a.waste - b.waste);

    if (sign.panel.sheetIndex){
      const only = scored.filter(x => `${x.s.w}x${x.s.h}` === sign.panel.sheetIndex);
      if (only.length) scored = only.concat(scored.filter(x => !only.includes(x)));
    }
    chosen = scored[0];

    sheetsUsed = chosen.n.sheets;
    panelJoins = chosen.n.joins;
    panelCost  = chosen.cost;
    sheetLabel = `${chosen.s.w} x ${chosen.s.h}`;
    sheetPrice = chosen.s.price;

    g('Panel','Sheet selected', `${num(chosen.s.w,0)} x ${num(chosen.s.h,0)}mm @ ${money(chosen.s.price)}`, null);
    g('Panel','Cutting plan', nestWords(chosen.n, chosen.s), null);
    g('Panel','Panel cost', `${sheetsUsed} sheet${sheetsUsed===1?'':'s'} x ${money(chosen.s.price)}`, panelCost);
    if (panelJoins > 0){
      g('Panel','Plan chosen on',
        `fewest joins first, then cost — ${money(panelCost)} of sheet + ${panelJoins} join${panelJoins===1?'':'s'} at ${money(joinCost)} of fabrication = ${money(chosen.all)} all in`,
        null, {sub:true});
    }

    /* Show the near misses, one line per distinct plan. */
    const seen = new Set([`${chosen.s.w}x${chosen.s.h}|${chosen.n.sheets}|${chosen.n.joins}`]);
    const alts = [];
    scored.slice(1).forEach(x => {
      const k = `${x.s.w}x${x.s.h}|${x.n.sheets}|${x.n.joins}`;
      if (seen.has(k)) return;
      seen.add(k);
      if (alts.length < 4) alts.push(`${x.s.w}x${x.s.h}: ${x.n.sheets} sh + ${x.n.joins} joins = ${money(x.all)}`);
    });
    if (alts.length) g('Panel','Plans rejected', alts.join('   ·   '), null, {sub:true});

    if (chosen.waste > 0) g('Panel','Offcut', `${num(chosen.waste,3)} m² of sheet unused`, null, {sub:true});
    if (chosen.n.fallback) warn.push('This panel is bigger than a sheet in both directions, so it has been gridded rather than stripped. Check the cutting plan by hand.');
    if (panelJoins > 0) warn.push(`${panelJoins} join${panelJoins===1?'':'s'} needed — ${num(panelJoins * (S.jointAllowanceHrs||0),2)} fabrication hrs added automatically.`);
  }

  const fin = pb.panelFinishes.find(f => f.name === sign.panel.finish) || pb.panelFinishes[0];
  const finishCost = (faceW > 0 && faceH > 0 ? devArea : 0) * (fin.costPerM2 || 0);
  g('Panel','Finish', `${fin.name} — ${num(devArea,4)} m² x ${money(fin.costPerM2||0)}/m²`, finishCost);

  /* --- 2. aperture --------------------------------------- */
  let apPanelCost = 0, apLedCost = 0, apLeds = 0, apJoins = 0;
  if (sign.aperture.on){
    const aw = +sign.aperture.width || 0, ah = +sign.aperture.height || 0;
    const apSheets = pb.sheets.filter(s => s.active && s.use === 'aperture' && s.material === sign.aperture.material);
    if (!apSheets.length){
      warn.push(`No active aperture sheet for "${sign.aperture.material}".`);
    } else {
      const scored = [];
      apSheets.forEach(s => nestOptions(aw, ah, s.w, s.h).forEach(n => {
        scored.push({ s, n, cost:n.sheets * s.price });
      }));
      scored.sort((a,b) => a.n.joins - b.n.joins || a.cost - b.cost || a.n.sheets - b.n.sheets);
      const c = scored[0];
      apPanelCost = c.cost;
      apJoins = c.n.joins;
      g('Aperture','Opening', `${num(aw,0)} x ${num(ah,0)}mm`, null);
      g('Aperture','Cutting plan', nestWords(c.n, c.s), null);
      g('Aperture','Aperture material', `${c.n.sheets} x ${money(c.s.price)}`, apPanelCost);
      if (apJoins > 0) warn.push(`Aperture needs ${apJoins} join${apJoins===1?'':'s'} — fabrication time for these is not added automatically.`);
      if (aw > faceW || ah > faceH) warn.push('Aperture is larger than the sign face.');
    }
    const grid = S.apertureLedGridMm || 200;
    apLeds = Math.ceil(aw/grid) * Math.ceil(ah/grid);
    const apLedBase = apLeds * S.apertureLedUnitCost;
    apLedCost = apLedBase * (1 + (S.apertureLedMarkupPct||0)/100);
    g('Aperture','Aperture LEDs', `ceil(${num(aw,0)}/${grid}) x ceil(${num(ah,0)}/${grid}) = ${apLeds} LEDs`, null);
    g('Aperture','Aperture LED cost',
      `${apLeds} x ${money(S.apertureLedUnitCost)}${S.apertureLedMarkupPct? ` +${S.apertureLedMarkupPct}%`:''}`, apLedCost);
  }

  /* --- 3. letters ---------------------------------------- */
  let letterCost = 0, illumCost = 0, letterLeds = 0, letterCount = 0, tallest = 0;
  sign.letterSets.forEach((set,idx) => {
    const qty = +set.qty || 0;
    if (!qty) return;
    const type = pb.letterTypes.find(t => t.name === set.type);
    if (!type){ warn.push(`Letter type "${set.type}" is not in the price book.`); return; }
    const fin2 = type.finishes.find(f => f.name === set.finish);
    if (!fin2){ warn.push(`Finish "${set.finish}" is not priced for ${set.type}.`); return; }

    const h = +set.height || 0;
    if (h <= 0){ warn.push(`Set ${idx+1}: enter a letter height — not priced.`); return; }
    const b = resolveBand(h, pb.heights, S.heightPolicy);
    if (b.i === -1){ warn.push(`${h}mm is not a priced band for ${set.type} and the price book is set to block off-grid heights.`); return; }

    const f  = overshootFactor(h, pb.heights);
    const unit = (fin2.prices[b.i] || 0) * f;
    const line = unit * qty;
    letterCost += line;
    letterCount += qty;
    tallest = Math.max(tallest, h);

    const tag = `Set ${idx+1}`;
    g('Letters',`${tag} — ${set.type} ${set.finish}`,
      `${qty} x ${num(h,0)}mm @ ${money(fin2.prices[b.i]||0)}${f!==1?` x ${num(f,3)} extrapolated`:''}${!b.exact&&!b.over?` (priced at the ${b.band}mm band)`:''}`, line);
    if (!b.exact && !b.over) warn.push(`${tag}: ${h}mm is between bands — priced at ${b.band}mm.`);
    if (b.over) warn.push(`${tag}: ${h}mm is above the largest priced band (${b.band}mm). Cost extrapolated — check it by hand.`);

    if (set.illum){
      const perLetter = (pb.illumination.costPerLetter[b.i] || 0) * f;
      const leds = Math.round((pb.illumination.ledsPerLetter[b.i] || 0) * f);
      illumCost += perLetter * qty;
      letterLeds += leds * qty;
      g('Letters',`${tag} — illumination`, `${qty} x ${money(pb.illumination.costPerLetter[b.i]||0)}${f!==1?` x ${num(f,3)}`:''}  ·  ${leds} LEDs each`, perLetter*qty);
    }
  });

  if (tallest > faceH && faceH) warn.push(`Tallest letter (${tallest}mm) is taller than the sign face (${faceH}mm).`);
  const estRun = sign.letterSets.reduce((a,s)=> a + (+s.qty||0) * (+s.height||0) * 0.62, 0);
  if (faceW && estRun > faceW) warn.push(`Letters need roughly ${Math.round(estRun)}mm of width — the face is ${faceW}mm. Rough estimate; check the artwork.`);

  /* --- 4. illumination hardware -------------------------- */
  const totalLeds = letterLeds + apLeds;
  let trCount = 0, trCost = 0, trName = '—';
  if (totalLeds > 0){
    const scored = pb.transformers.map(t => {
      const c = Math.ceil(totalLeds / t.maxLeds);
      return { t, c, cost:c*t.price };
    }).sort((a,b)=>a.cost-b.cost);
    const pick = sign.transformer && sign.transformer !== 'auto'
      ? scored.find(x => x.t.name === sign.transformer) || scored[0]
      : scored[0];
    trCount = pick.c; trCost = pick.cost; trName = pick.t.name;
    g('Illumination','Total LEDs', `${letterLeds} in letters + ${apLeds} in aperture`, null);
    g('Illumination','Transformers', `${trName} holds ${pick.t.maxLeds} — ceil(${totalLeds}/${pick.t.maxLeds}) = ${trCount}`, null);
    g('Illumination','Transformer cost', `${trCount} x ${money(pick.t.price)}`, trCost);
    if (sign.transformer === 'auto' && scored.length > 1){
      g('Illumination','Alternatives considered', scored.slice(1).map(x=>`${x.t.name}: ${x.c} = ${money(x.cost)}`).join('   ·   '), null, {sub:true});
    }
  }

  /* --- 5. labour ----------------------------------------- */
  let labourCost = 0;
  const jointHrs = panelJoins * (S.jointAllowanceHrs || 0);
  pb.labour.forEach(l => {
    let hrs = +(sign.hours[l.op] || 0);
    if (/fabricat/i.test(l.op) && jointHrs > 0) hrs += jointHrs;
    if (!hrs) return;
    const c = hrs * l.rate;
    labourCost += c;
    const auto = (/fabricat/i.test(l.op) && jointHrs > 0)
      ? ` (incl. ${num(jointHrs,2)} hrs for ${panelJoins} join${panelJoins===1?'':'s'})` : '';
    g('Labour', l.op, `${num(hrs,2)} hrs x ${money(l.rate)}/hr${auto}`, c);
  });
  if (!labourCost) warn.push('No production hours entered — labour is £0.00.');

  /* --- 6. markup and totals ------------------------------ */
  const materials = panelCost + finishCost + apPanelCost + apLedCost + trCost;
  const markup = materials * markupPct/100;
  const lettersTotal = letterCost + illumCost;
  const unitTotal = materials + markup + lettersTotal + labourCost;
  const qty = Math.max(1, +sign.qty || 1);
  const total = unitTotal * qty;

  g('Total','Materials at cost', 'panel + finish + aperture + transformers', materials, {sub:true});
  g('Total',`Markup ${num(markupPct,0)}%`, `${money(materials)} x ${num(markupPct,0)}%`, markup);
  g('Total','Letters and illumination', 'price book figures already include markup', lettersTotal, {sub:true});
  g('Total','Production labour', 'charged at the hourly sell rate, no further markup', labourCost, {sub:true});
  g('Total', qty > 1 ? 'Cost each' : 'Sign total', '', unitTotal, {total:qty===1});
  if (qty > 1) g('Total','Sign total', `${qty} off x ${money(unitTotal)}`, total, {total:true});

  return {
    trace: tr, warnings: warn,
    panelCost, finishCost, apPanelCost, apLedCost, letterCost, illumCost,
    trCost, trCount, trName, labourCost, materials, markup, markupPct,
    lettersTotal, unitTotal, total, totalLeds, sheetsUsed, panelJoins, apJoins, sheetLabel, sheetPrice, letterCount, devArea, devW, devH
  };
}

function costJob(job, pb){
  const signs = job.signs.map(s => ({ sign:s, r:costSign(s, pb) }));
  const signsTotal = signs.reduce((a,x)=>a+x.r.total, 0);
  const extras = job.extras.map(e => {
    const base = (+e.qty||0) * (+e.unitCost||0);
    const val  = e.markup ? base * (1 + pb.settings.markupPct/100) : base;
    return Object.assign({}, e, { base, val });
  });
  const extrasTotal = extras.reduce((a,e)=>a+e.val, 0);
  const net = signsTotal + extrasTotal;
  const vat = net * (pb.settings.vatPct/100);
  return { signs, extras, signsTotal, extrasTotal, net, vat, gross: net + vat };
}
module.exports = { defaultPriceBook, costSign, costJob };
