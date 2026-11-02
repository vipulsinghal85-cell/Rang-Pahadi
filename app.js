/* Rang Pahadi Studio website. Reads workshops from the Google Sheet (via Apps Script) and saves bookings to it. */
(() => {
'use strict';
const CFG = window.STUDIO_CONFIG || {};
const API = String(CFG.SHEET_API_URL || '').trim();
const CACHE_KEY = 'rp-studio-cache-v1';
const CATS = ['Traditional Indian art','Painting & drawing','Mixed media & texture','Pottery & crafts','Handicrafts','Kids'];

const S = { settings:{}, workshops:[], loaded:false, error:false, demo:!API, cat:'All', updated:null };

/* ---------- sample data (shown until the Google Sheet is connected) ---------- */
function sampleData(){
  const base = new Date(); base.setHours(0,0,0,0);
  const day = n => { const d = new Date(base); d.setDate(d.getDate()+n); return iso(d); };
  const w = (id,title,category,n,start,durationMins,seats,price,unit,level,description,booked) => ({id,title,category,date:day(n),start,durationMins,seats,price,unit,level,description,status:'open',booked});
  return {
    settings:{ name:'Rang Pahadi Studio', city:'Dehradun · Uttarakhand', hours:'Tue–Sun, 10 AM–7 PM', whatsapp:CFG.WHATSAPP||'',
      tagline:"Hands-on art workshops in the Doon valley: Aipan, Madhubani, texture art, pottery, handicrafts and kids' classes. All materials included.",
      about:"Rang Pahadi Studio is a hands-on art studio in Dehradun, started by an artist who grew up with the colours of the hills. Many people say they \"can't draw\". The studio is here to prove them wrong, one afternoon at a time.\n\nWe teach the folk art of Uttarakhand and India, like Aipan, Madhubani and mandala, alongside texture art, mixed media, pottery and handicrafts. Every workshop is guided step by step, all materials are included, and you take home something you made yourself.\n\nCome alone, bring friends, or bring the kids. Our studio is a calm, messy and welcoming place to slow down and make something.",
      artistName:'Akanksha Singhal', artistRole:'Founder & lead artist',
      artistBio:'Akanksha Singhal is a Dehradun-based artist working across painting, mixed media, texture art and traditional Indian folk forms. She started Rang Pahadi Studio to share the joy of making art with anyone who walks in, from first-timers to practising artists.',
      artistQuote:'Everyone can make art. Most people just need a table, good materials and an afternoon.' },
    workshops:[
      w('s1','Aipan Art (Kumaoni folk)','Traditional Indian art',5,'11:00',150,12,1200,'per person','Beginner · Ages 14+','Learn the geru-and-rice-paste patterns of Kumaon and paint your own Aipan plate.',4),
      w('s2','Texture Art on Canvas','Mixed media & texture',6,'11:00',180,12,1800,'per person','Beginner','Build raised floral textures with modelling paste and palette knives on a 12×12 canvas.',9),
      w('s3','Acrylic Paint & Sip','Painting & drawing',6,'17:00',150,16,1500,'per person','No experience needed','A guided Mussoorie sunset painting with mocktails. Good for friends and date nights.',6),
      w('s4',"Kids' Art Club (4 Saturdays)",'Kids',12,'10:00',90,15,3000,'per child / month','Ages 6–12','Drawing, colour, clay and craft every Saturday. Screen-free and messy.',3),
      w('s5','Pottery: Hand-building','Pottery & crafts',13,'11:00',180,10,2000,'per person','Beginner · Ages 14+','Pinch and coil a bowl and a planter. Pieces are fired and ready to collect in 2 weeks.',10),
      w('s6','Block Printing on Tote','Handicrafts',19,'11:00',150,12,1500,'per person','All levels','Hand-block print a cotton tote with traditional wooden blocks and fabric colours.',2),
      w('s7','Watercolour Basics','Painting & drawing',27,'11:00',150,12,1200,'per person','Beginner',"Washes, wet-on-wet and layering. You'll paint two small hill scenes.",0),
    ]
  };
}

/* ---------- helpers ---------- */
function el(tag, attrs, ...kids){
  const n = document.createElement(tag);
  if (attrs) for (const [k,v] of Object.entries(attrs)){
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'html') n.innerHTML = v;
    else n.setAttribute(k, v === true ? (k.startsWith('aria-') ? 'true' : '') : v);
  }
  for (const k of kids.flat()){ if (k == null || k === false) continue; n.append(k.nodeType ? k : document.createTextNode(String(k))); }
  return n;
}
const iso = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const inr = n => '₹' + Number(n||0).toLocaleString('en-IN');
const todayISO = () => iso(new Date());
const parseD = s => { const [y,m,d] = (s||'').split('-').map(Number); return new Date(y,(m||1)-1,d||1); };
const fmtDay = s => parseD(s).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'});
const fmtTime = t => { if(!t) return ''; const [h,m] = t.split(':').map(Number); return ((h%12)||12)+(m?':'+String(m).padStart(2,'0'):'')+' '+(h>=12?'PM':'AM'); };
const fmtDur = mins => { mins=Number(mins)||0; const h=Math.floor(mins/60), m=mins%60; return (h?h+' h':'')+(m?(h?' ':'')+m+' min':''); };
const digits = s => String(s||'').replace(/\D/g,'');
function toast(msg){ const t = el('div',{class:'toast',role:'status'},msg); document.body.append(t); setTimeout(()=>t.remove(),2600); }
async function copyText(text, btn){
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch { const r = document.createRange(); r.selectNodeContents(btn.previousSibling || btn); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Selected. Press copy.'); }
}
function waNumber(){ const n = digits(S.settings.whatsapp || CFG.WHATSAPP); if(!n) return ''; return n.length===10 ? '91'+n : n; }
function waLink(text){ const n = waNumber(); return n ? 'https://wa.me/'+n+'?text='+encodeURIComponent(text) : null; }
const seatsLeft = w => Math.max(0, (Number(w.seats)||0) - (Number(w.booked)||0));
const upcoming = () => S.workshops.filter(w => w.date >= todayISO()).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));

/* ---------- themes per workshop type ---------- */
const THEMES = {
  'Traditional Indian art': {band:'#9b3a22', motif:'aipan',   sub:'folk art of Kumaon and beyond',      deva:'लोक कला'},
  'Painting & drawing':     {band:'#2b4a7a', motif:'brush',   sub:'paint the light of the Doon valley',  deva:'चित्रकला'},
  'Mixed media & texture':  {band:'#86561a', motif:'texture', sub:'layers, textures and found things',   deva:'मिश्रित कला'},
  'Pottery & crafts':       {band:'#7a4430', motif:'wheel',   sub:'clay, hands and a slow wheel',        deva:'मिट्टी'},
  'Handicrafts':            {band:'#2c5a50', motif:'block',   sub:'block prints, knots and bamboo',      deva:'हस्तशिल्प'},
  'Kids':                   {band:'#8a2d60', motif:'kids',    sub:'messy, bright and screen-free',       deva:'बच्चों की कला'},
  default:                  {band:'#9b3a22', motif:'aipan',   sub:'art workshops from the hills',        deva:'रंग पहाड़ी'},
};
const wrapSVG = inner => `<svg viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="mclip"><circle cx="300" cy="300" r="290"/></clipPath></defs><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${inner}</g></svg>`;
const MOTIFS = {
  aipan(){
    const C = 300, T = Math.PI*2; let s = '';
    const pt = (r,a) => [(C+r*Math.cos(a)).toFixed(1), (C+r*Math.sin(a)).toFixed(1)];
    const dots = (r,n,size) => { for (let i=0;i<n;i++){ const [x,y]=pt(r,i/n*T); s+=`<circle cx="${x}" cy="${y}" r="${size}" fill="currentColor" stroke="none"/>`; } };
    [36,64,148,196,268,292].forEach(r => s += `<circle cx="${C}" cy="${C}" r="${r}"/>`);
    for (let i=0;i<8;i++){ const a=i/8*T, [x1,y1]=pt(8,a), [x2,y2]=pt(32,a-.22), [x3,y3]=pt(32,a+.22), [x4,y4]=pt(34,a); s+=`<path d="M${x1} ${y1} Q${x2} ${y2} ${x4} ${y4} Q${x3} ${y3} ${x1} ${y1}Z"/>`; }
    dots(50,16,3);
    for (let i=0;i<12;i++){ const a=i/12*T, [x1,y1]=pt(64,a), [x2,y2]=pt(146,a), [c1x,c1y]=pt(120,a-.3), [c2x,c2y]=pt(120,a+.3), [l1,l2]=pt(80,a), [l3,l4]=pt(128,a);
      s+=`<path d="M${x1} ${y1} Q${c1x} ${c1y} ${x2} ${y2} Q${c2x} ${c2y} ${x1} ${y1}Z"/><line x1="${l1}" y1="${l2}" x2="${l3}" y2="${l4}"/>`; }
    for (let i=0;i<12;i++){ const a=(i+.5)/12*T, [x,y]=pt(136,a); s+=`<circle cx="${x}" cy="${y}" r="4" fill="currentColor" stroke="none"/>`; }
    dots(172,36,2.6);
    const n=24, st=T/n;
    for (let i=0;i<n;i++){ const a=i*st, [x1,y1]=pt(196,a), [x2,y2]=pt(196,a+st), [cx,cy]=pt(262,a+st/2), [ix,iy]=pt(222,a+st/2);
      s+=`<path d="M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}"/><circle cx="${ix}" cy="${iy}" r="3.2" fill="currentColor" stroke="none"/>`; }
    dots(280,72,2.2);
    return wrapSVG(s);
  },
  brush(){
    let s=''; for (let r=40;r<=280;r+=34) s+=`<circle cx="300" cy="300" r="${r}" stroke-width="${(2+r/70).toFixed(1)}" stroke-dasharray="${(r*.9).toFixed(0)} ${(r*.25).toFixed(0)}" transform="rotate(${r*3} 300 300)"/>`;
    for (let i=0;i<36;i++){ const a=i/36*Math.PI*2, r1=i%2?286:270; s+=`<line x1="${(300+r1*Math.cos(a)).toFixed(1)}" y1="${(300+r1*Math.sin(a)).toFixed(1)}" x2="${(300+296*Math.cos(a)).toFixed(1)}" y2="${(300+296*Math.sin(a)).toFixed(1)}"/>`; }
    return wrapSVG(s+'<circle cx="300" cy="300" r="14" fill="currentColor" stroke="none"/>');
  },
  texture(){
    let s='', row=0; for (let y=10;y<=600;y+=30,row++) for (let x=(row%2?24:0);x<=624;x+=48) s+=`<path d="M${x-24} ${y} A24 24 0 0 1 ${x+24} ${y}"/>`;
    return wrapSVG(`<g clip-path="url(#mclip)" stroke-width="2">${s}</g><circle cx="300" cy="300" r="290"/>`);
  },
  wheel(){
    let d='M300 300'; for (let t=0;t<=Math.PI*22;t+=.08){ const r=4+t*4; d+=` L${(300+r*Math.cos(t)).toFixed(1)} ${(300+r*Math.sin(t)).toFixed(1)}`; }
    return wrapSVG(`<path d="${d}" stroke-width="2"/><circle cx="300" cy="300" r="290"/>`);
  },
  block(){
    let s=''; const buti=(x,y)=>{ let p=''; for(let k=0;k<4;k++){ const a=k*Math.PI/2, ex=(x+11*Math.cos(a)).toFixed(1), ey=(y+11*Math.sin(a)).toFixed(1); p+=`<ellipse cx="${ex}" cy="${ey}" rx="9" ry="5" transform="rotate(${k*90} ${ex} ${ey})"/>`; } return p+`<circle cx="${x}" cy="${y}" r="3.5" fill="currentColor" stroke="none"/>`; };
    for (let y=30;y<600;y+=60) for (let x=30;x<600;x+=60){ s+=buti(x,y); s+=`<circle cx="${x+30}" cy="${y+30}" r="2.5" fill="currentColor" stroke="none"/>`; }
    return wrapSVG(`<g clip-path="url(#mclip)" stroke-width="2">${s}</g><circle cx="300" cy="300" r="290"/><circle cx="300" cy="300" r="276" stroke-dasharray="2 10"/>`);
  },
  kids(){
    let s='', seed=7; const rnd=()=>{ seed=(seed*9301+49297)%233280; return seed/233280; };
    const star=(x,y,r)=>{ let p=''; for(let i=0;i<10;i++){ const a=-Math.PI/2+i*Math.PI/5, rr=i%2?r*.45:r; p+=(i?'L':'M')+(x+rr*Math.cos(a)).toFixed(1)+' '+(y+rr*Math.sin(a)).toFixed(1); } return `<path d="${p}Z"/>`; };
    for (let i=0;i<34;i++){ const x=40+rnd()*520, y=40+rnd()*520, k=i%4, z=14+rnd()*18;
      s += k===0 ? star(x,y,z) : k===1 ? `<path d="M${(x-z).toFixed(1)} ${y.toFixed(1)} q${(z/2).toFixed(1)} -${z.toFixed(1)} ${z.toFixed(1)} 0 t${z.toFixed(1)} 0"/>` : k===2 ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(z/2).toFixed(1)}"/>` : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="currentColor" stroke="none"/>`; }
    return wrapSVG(`<g clip-path="url(#mclip)">${s}</g><circle cx="300" cy="300" r="290" stroke-dasharray="14 12"/>`);
  },
};

/* ---------- rendering ---------- */
function render(){
  const st = S.settings;
  document.title = st.name || 'Rang Pahadi Studio';
  document.getElementById('brandmini').textContent = st.name || 'Rang Pahadi Studio';
  const next = upcoming().find(w => w.status!=='cancelled' && (S.cat==='All' || w.category===S.cat));
  const picked = S.cat !== 'All';
  const theme = THEMES[picked ? S.cat : (next && next.category)] || THEMES.default;
  const words = picked ? theme : THEMES.default;
  const usedCats = CATS.filter(c => S.workshops.some(w => w.category===c));
  const studioWA = waLink(`Hi ${st.name||'Rang Pahadi Studio'}! I'd like to know about private parties / group bookings.`);

  const hero = el('div',{style:`--band:${theme.band}`}, el('section',{class:'band'},
    el('div',{class:'mandala','aria-hidden':'true',html:MOTIFS[theme.motif]()}),
    el('div',{class:'wrap hero'},
      el('div',null,
        el('img',{class:'hero-logo',src:'logo-512.png',alt:'',width:'132',height:'132'}),
        el('div',{class:'hero-top'}, el('span',{class:'eyebrow'}, picked ? S.cat : (st.city || 'Dehradun · Uttarakhand')), el('span',{class:'rule'}), el('span',{class:'deva',lang:'hi'},words.deva)),
        el('h1',null, st.name || 'Rang Pahadi Studio'),
        el('div',{class:'sub'}, words.sub),
        el('p',{class:'lede'}, st.tagline || ''),
        el('ul',{class:'facts'}, el('li',null,'Batches of 10–16'), el('li',null,'All materials included'), el('li',null,'Take your art home')),
        el('div',{class:'hero-actions'},
          el('a',{class:'btn btn-onband',href:'#calendar'},'See all workshops'),
          el('a',{class:'btn btn-linkband',href:'#about'},'About us'),
          studioWA ? el('a',{class:'btn btn-linkband',href:studioWA,target:'_blank',rel:'noopener'},'Private parties & groups') : null),
        usedCats.length > 1 ? el('div',{class:'explore',role:'group','aria-label':'Explore by workshop type'},
          el('span',{class:'eyebrow'},'Explore'),
          ['All',...usedCats].map(c => el('button',{type:'button','aria-pressed':S.cat===c,onclick:()=>{S.cat=c;render();}}, c==='All'?'Everything':c))) : null
      ),
      nextTicket(next)
    )
  ), el('div',{class:'band-edge','aria-hidden':'true'}));

  const crafts = ['Aipan','Madhubani','Texture art','Pottery','Block printing','Mandala','Watercolour','Macramé','Ringaal craft','Kids’ art club'];
  const marquee = el('div',{class:'marquee','aria-label':'Crafts taught at the studio: '+crafts.join(', ')},
    el('div',{class:'track','aria-hidden':'true'}, [...crafts,...crafts].map(c => el('span',null,c))));

  const list = upcoming().filter(w => S.cat==='All' || w.category===S.cat);
  const chips = el('div',{class:'chips',role:'group','aria-label':'Filter by category'},
    ['All',...usedCats].map(c => el('button',{type:'button',class:'chip','aria-pressed':S.cat===c,onclick:()=>{S.cat=c;render();}}, c)));
  let grid;
  if (!S.loaded) grid = el('div',{class:'empty'},'Loading upcoming workshops…');
  else if (!list.length) grid = el('div',{class:'empty'}, S.workshops.length ? 'No upcoming workshops of this type. Try another one.' : 'New workshop dates are coming soon. Message us on WhatsApp to hear first.');
  else grid = el('div',{class:'grid'}, list.map(workshopCard));

  const visit = el('div',{class:'panel',id:'visit'},
    el('h2',null,'Visit & pay'),
    el('p',{class:'desc'}, 'Book a seat here, then pay by UPI to confirm it. All materials are included in the price.'),
    el('ul',{class:'list',style:'margin-top:10px'},
      st.address ? el('li',{class:'row'}, el('span',{class:'meta'},'Studio'), el('span',null,st.address)) : null,
      st.hours ? el('li',{class:'row'}, el('span',{class:'meta'},'Hours'), el('span',null,st.hours)) : null,
      waNumber() ? el('li',{class:'row'}, el('span',{class:'meta'},'WhatsApp'), copyChip(digits(st.whatsapp||CFG.WHATSAPP))) : null,
      st.upi ? el('li',{class:'row'}, el('span',{class:'meta'},'UPI ID'), copyChip(st.upi)) : null)
  );
  const groups = el('div',{class:'panel'},
    el('h2',null,'Parties & groups'),
    el('p',{class:'desc'},'Birthdays, kitty parties, bachelorettes, school visits and team offsites. We run private sessions at the studio or at your venue, from 8 people.'),
    studioWA ? el('div',{style:'margin-top:14px'}, el('a',{class:'btn btn-primary',href:studioWA,target:'_blank',rel:'noopener'},'Ask on WhatsApp')) : null
  );

  const notice = S.error && !S.workshops.length ? el('div',{class:'notice'},'The workshop calendar couldn’t load. Check your connection and refresh the page.')
    : S.error ? el('div',{class:'notice'},'Showing the last saved calendar. Seat counts may be out of date.') : null;

  document.getElementById('app').replaceChildren(...[
    S.demo ? el('div',{class:'demo'},'Sample calendar. Connect your Google Sheet in config.js to show real workshops (see README).') : null,
    hero, marquee,
    el('main',{class:'wrap',id:'calendar'},
      notice,
      el('div',{class:'section-head'}, el('h2',null,'Upcoming workshops'), el('span',{class:'meta'}, S.loaded ? `${upcoming().length} scheduled` : '')),
      chips, grid,
      aboutSection(st),
      el('div',{class:'split'}, visit, groups)
    ),
    el('footer',null, el('div',{class:'wrap'},
      el('span',null, `© ${new Date().getFullYear()} ${st.name||'Rang Pahadi Studio'} · ${st.city||'Dehradun, Uttarakhand'}`),
      S.updated ? el('span',{class:'updated'}, 'Calendar updated '+new Date(S.updated).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})) : null))
  ].filter(Boolean));
}

function nextTicket(w){
  if (!w) return el('aside',{class:'ticket'}, el('div',{class:'ticket-top'}, el('div',{class:'eyebrow'},'Next workshop'),
    el('h3',{style:'margin-top:10px'}, S.loaded ? 'New dates coming soon' : 'Loading the calendar…')));
  const left = seatsLeft(w), total = Number(w.seats)||0, pct = total ? Math.round((total-left)/total*100) : 0;
  const d = parseD(w.date), full = left<=0, hot = !full && left <= Math.max(2, Math.ceil(total*0.25));
  return el('aside',{class:'ticket','aria-label':'Next workshop'},
    el('div',{class:'ticket-top'},
      el('div',{class:'eyebrow'},'Next workshop'),
      el('div',{class:'ticket-head'},
        el('div',{class:'datebox'}, el('b',null,d.getDate()), el('span',null,d.toLocaleDateString('en-IN',{month:'short'}))),
        el('div',{style:'min-width:0'}, el('div',{class:'cat'}, w.category||'Workshop'), el('h3',null,w.title))),
      el('div',{class:'meta',style:'margin-top:10px'}, `${fmtDay(w.date)} · ${fmtTime(w.start)} · ${fmtDur(w.durationMins)}`)),
    el('div',{class:'ticket-perf'}),
    el('div',{class:'ticket-bottom'},
      el('div',null,
        el('div',{class:'meter'+(hot||full?' hot':'')}, el('i',{style:`width:${pct}%`})),
        el('div',{class:'seats'+(full?' full':hot?' hot':''),style:'margin-top:5px'}, full ? 'Fully booked' : `${left} of ${total} seats left`)),
      el('div',{class:'ticket-row'},
        el('div',{class:'price'}, inr(w.price), ' ', el('small',null, w.unit || 'per person')),
        full ? null : el('button',{type:'button',class:'btn btn-primary',onclick:()=>openBooking(w)},'Book a seat')))
  );
}

function workshopCard(w){
  const left = seatsLeft(w), total = Number(w.seats)||0, pct = total ? Math.round((total-left)/total*100) : 0;
  const cancelled = w.status==='cancelled', full = left<=0;
  const hot = !full && left <= Math.max(2, Math.ceil(total*0.25));
  const d = parseD(w.date);
  const waitlist = waLink(`Hi! Please add me to the waitlist for "${w.title}" on ${fmtDay(w.date)}.`);
  return el('article',{class:'card'},
    el('div',{class:'when'},
      el('div',{class:'datebox'}, el('b',null,d.getDate()), el('span',null,d.toLocaleDateString('en-IN',{month:'short'}))),
      el('div',{style:'min-width:0'}, el('div',{class:'cat'}, w.category||'Workshop'), el('h3',null,w.title))),
    el('div',{class:'meta'}, `${fmtDay(w.date)} · ${fmtTime(w.start)} · ${fmtDur(w.durationMins)}${w.level?' · '+w.level:''}`),
    w.description ? el('p',{class:'desc'}, w.description) : null,
    cancelled ? el('span',{class:'pill bad'},'Cancelled') :
    el('div',null,
      el('div',{class:'meter'+(hot||full?' hot':'')}, el('i',{style:`width:${pct}%`})),
      el('div',{class:'seats'+(full?' full':hot?' hot':''),style:'margin-top:5px'}, full ? 'Fully booked' : `${left} of ${total} seats left`)),
    el('div',{class:'cardfoot'},
      el('div',{class:'price'}, inr(w.price), ' ', el('small',null, w.unit || 'per person')),
      cancelled ? null :
      full ? (waitlist ? el('a',{class:'btn btn-ghost',href:waitlist,target:'_blank',rel:'noopener'},'Join waitlist') : null)
           : el('button',{type:'button',class:'btn btn-primary',onclick:()=>openBooking(w)},'Book a seat'))
  );
}

function aboutSection(st){
  const story = (st.about || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => el('p',null,p));
  const artist = st.artistName || '';
  const initials = artist.split(/\s+/).filter(Boolean).slice(0,2).map(w => w[0].toUpperCase()).join('') || 'RP';
  return el('section',{class:'about',id:'about','aria-labelledby':'about-title'},
    el('div',null,
      el('div',{class:'eyebrow'},'About us'),
      el('h2',{id:'about-title'}, 'A studio rooted in the ', el('em',null,'hills'), ', open to everyone'),
      el('div',{class:'story'}, story),
      el('ul',{class:'pillars'},
        el('li',null, el('b',null,'Rooted in Uttarakhand'), el('span',null,'Aipan, Ringaal and pahadi colours sit beside modern mixed media.')),
        el('li',null, el('b',null,'No experience needed'), el('span',null,'Every session starts from the basics. You leave with a finished piece.')),
        el('li',null, el('b',null,'Small batches'), el('span',null,'10–16 people, so the artist can guide every student.')))),
    artist ? el('aside',{class:'artist','aria-label':'Meet the artist'},
      el('div',{class:'eyebrow',style:'color:var(--geru);opacity:1'},'Meet the artist'),
      el('div',{class:'artist-head'},
        el('div',{class:'avatar','aria-hidden':'true'}, initials),
        el('div',null, el('h3',null, artist), el('div',{class:'role'}, st.artistRole || 'Founder & lead artist'))),
      st.artistBio ? el('p',null, st.artistBio) : null,
      st.artistQuote ? el('div',{class:'quote'}, '“'+st.artistQuote+'”') : null) : null
  );
}

function copyChip(text){
  const b = el('button',{type:'button',class:'btn btn-ghost btn-sm',onclick:e=>copyText(text,e.currentTarget)},'Copy');
  return el('span',{class:'copy'}, el('span',null,text), b);
}

/* ---------- modal & booking ---------- */
let lastFocus = null;
function openModal(node){
  lastFocus = document.activeElement;
  const ov = el('div',{class:'overlay',onclick:e=>{ if(e.target===ov) closeModal(); }}, node);
  document.getElementById('modalRoot').replaceChildren(ov);
  const f = node.querySelector('input:not(.hp input),select,textarea,button'); if (f) f.focus();
}
function closeModal(){ document.getElementById('modalRoot').replaceChildren(); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
document.addEventListener('keydown', e => { if (e.key==='Escape') closeModal(); });

function loadContact(){ try { return JSON.parse(localStorage.getItem('rp-contact')||'{}'); } catch { return {}; } }
function saveContact(c){ try { localStorage.setItem('rp-contact', JSON.stringify(c)); } catch {} }

function openBooking(w){
  const left = seatsLeft(w), c = loadContact();
  const name = el('input',{id:'bk-name',autocomplete:'name',value:c.name||''});
  const phone = el('input',{id:'bk-phone',inputmode:'tel',autocomplete:'tel',value:c.phone||'',placeholder:'10-digit mobile'});
  const seats = el('select',{id:'bk-seats'}, Array.from({length:Math.max(1,Math.min(6,left))},(_,i)=>el('option',{value:i+1},i+1)));
  const note = el('textarea',{id:'bk-note',placeholder:'Anything we should know? (optional)'});
  const hp = el('input',{id:'bk-website',tabindex:'-1',autocomplete:'off'});
  const totalEl = el('strong'); const err = el('div',{class:'err',role:'alert'});
  const msg = () => `Hi ${S.settings.name||'Rang Pahadi Studio'}! I'd like to book ${seats.value} seat(s) for "${w.title}" on ${fmtDay(w.date)} at ${fmtTime(w.start)}.\nName: ${name.value||'-'}\nPhone: ${phone.value||'-'}${note.value?'\nNote: '+note.value:''}`;
  const wa = el('a',{class:API?'btn btn-ghost':'btn btn-primary',target:'_blank',rel:'noopener'},'Send on WhatsApp');
  const sync = () => { totalEl.textContent = inr(w.price*Number(seats.value)); const l = waLink(msg()); if (l) wa.href = l; wa.hidden = !l; };
  [name,phone,seats,note].forEach(i => i.addEventListener('input', sync));

  const submit = el('button',{type:'submit',class:'btn btn-primary'},'Confirm booking');
  const form = el('form',{novalidate:true,onsubmit:async e=>{
    e.preventDefault(); err.textContent='';
    if (!name.value.trim()) { err.textContent='Please add your name.'; name.focus(); return; }
    if (digits(phone.value).length < 10) { err.textContent='Please add a 10-digit mobile number so the studio can reach you.'; phone.focus(); return; }
    saveContact({name:name.value.trim(), phone:phone.value.trim()});
    submit.disabled = true; submit.textContent = 'Booking…';
    try {
      const res = await fetch(API, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
        body: JSON.stringify({workshopId:w.id, name:name.value.trim(), phone:phone.value.trim(), seats:Number(seats.value), note:note.value.trim(), website:hp.value})});
      const out = await res.json();
      if (out.ok) { showBooked(w, Number(seats.value), out); load(); return; }
      err.textContent = out.message || 'Your booking didn’t go through. Please try again or send it on WhatsApp.';
      if (out.error==='full' || out.error==='not_found') load();
    } catch {
      err.textContent = 'Your booking didn’t go through. Check your connection and try again, or send it on WhatsApp.';
    }
    submit.disabled = false; submit.textContent = 'Confirm booking';
  }},
    el('div',{class:'form'},
      el('label',{class:'full',for:'bk-name'},'Your name', name),
      el('label',{for:'bk-phone'},'Mobile number', phone),
      el('label',{for:'bk-seats'},'Seats', seats),
      el('label',{class:'full',for:'bk-note'},'Note', note),
      el('label',{class:'hp','aria-hidden':'true'},'Leave this empty', hp)),
    el('div',{class:'total'}, el('span',null,'Total (materials included)'), totalEl),
    !API ? el('p',{class:'meta',style:'margin:10px 0 0'},'Send your booking on WhatsApp and the studio will confirm your seat.') : null,
    err,
    el('div',{class:'modal-foot'},
      el('button',{type:'button',class:'btn btn-ghost',onclick:closeModal},'Close'),
      wa, API ? submit : null)
  );
  sync();
  openModal(el('div',{class:'modal',role:'dialog','aria-modal':'true','aria-labelledby':'bk-title'},
    el('div',{class:'cat'}, w.category),
    el('h2',{id:'bk-title'}, w.title),
    el('div',{class:'meta'}, `${fmtDay(w.date)} · ${fmtTime(w.start)} · ${fmtDur(w.durationMins)} · ${left} seats left`),
    form));
}

function showBooked(w, seats, out){
  const amt = inr(out.amount || w.price*seats);
  const l = waLink(`Hi! I just booked ${seats} seat(s) for "${w.title}" on ${fmtDay(w.date)}. Booking ID ${out.id}. Sharing my UPI payment of ${amt}.`);
  openModal(el('div',{class:'modal',role:'dialog','aria-modal':'true','aria-labelledby':'ok-title'},
    el('div',{class:'eyebrow',style:'color:var(--deodar);opacity:1'},'Booking received'),
    el('h2',{id:'ok-title',style:'margin-top:6px'}, 'See you at the studio!'),
    el('p',{class:'desc'}, `${w.title} · ${fmtDay(w.date)} at ${fmtTime(w.start)} · ${seats} seat${seats>1?'s':''}`),
    el('div',{class:'total'}, el('span',null,'Booking ID'), el('span',{class:'confirm-id'}, out.id)),
    el('div',{class:'total'}, el('span',null,'Amount to pay'), el('strong',null,amt)),
    S.settings.upi ? el('div',{class:'info',style:'margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap'}, 'Pay by UPI to confirm your seat:', copyChip(S.settings.upi)) : null,
    el('p',{class:'meta',style:'margin:12px 0 0'},'Take a screenshot of this page for your records.'),
    el('div',{class:'modal-foot'}, l ? el('a',{class:'btn btn-ghost',href:l,target:'_blank',rel:'noopener'},'Send payment screenshot') : null,
      el('button',{type:'button',class:'btn btn-primary',onclick:closeModal},'Done'))));
}

/* ---------- data loading ---------- */
function apply(data){
  S.settings = data.settings || {};
  S.workshops = Array.isArray(data.workshops) ? data.workshops : [];
  S.updated = data.updated || null;
  S.loaded = true;
}
async function load(){
  if (!API) { apply(sampleData()); render(); return; }
  try {
    const res = await fetch(API + (API.includes('?') ? '&' : '?') + 't=' + Date.now());
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'bad');
    apply(data); S.error = false;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
  } catch {
    S.error = true; S.loaded = true;
  }
  render();
}

try { const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (API && cached && cached.ok) apply(cached); } catch {}
render();
load();
setInterval(() => { if (!document.hidden && API) load(); }, 120000);
})();
