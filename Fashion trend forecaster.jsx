const { useState, useEffect } = React;

// ─── No external chart library — all charts are hand-built SVG ────────────

const C = {
  ink:"#0a0a0a", cream:"#f5f0e8", warm:"#ede6d6", accent:"#c8431a",
  gold:"#b8974a", muted:"#8a8070", border:"#d4c9b4",
  up:"#2d7a4f", down:"#c8431a",
  p:["#c8431a","#b8974a","#2d7a4f","#5b6fa6","#8a6a9a","#4a8a8a","#9a584a"],
};

const SEED_TRENDS = [
  {name:"Quiet Luxury",arrow:"up"},{name:"Gorpcore Revival",arrow:"up"},
  {name:"Sheer Layering",arrow:"flat"},{name:"Micro-Bags",arrow:"down"},
  {name:"Ballet Flats",arrow:"up"},{name:"Moto Aesthetic",arrow:"flat"},
  {name:"Oversized Suiting",arrow:"down"},{name:"Coastal Grandma",arrow:"down"},
];

const DEFAULT_DASH = {
  kpis:[
    {label:"Trends Tracked",value:"142",delta:"+18 this month",up:true},
    {label:"Rising Styles",value:"38",delta:"+12 vs last season",up:true},
    {label:"Declining",value:"21",delta:"−5 vs last season",up:false},
    {label:"Avg Confidence",value:"74%",delta:"+3pts",up:true},
  ],
  seasonal:[
    {season:"Spring",Casual:68,Formal:42,Street:55,Luxury:38},
    {season:"Summer",Casual:82,Formal:28,Street:70,Luxury:30},
    {season:"Fall",Casual:60,Formal:58,Street:48,Luxury:55},
    {season:"Winter",Casual:50,Formal:65,Street:38,Luxury:62},
  ],
  stores:[
    {name:"Zara",pct:24},{name:"Net-a-Porter",pct:18},{name:"SSENSE",pct:15},
    {name:"ASOS",pct:13},{name:"Nordstrom",pct:11},{name:"Farfetch",pct:10},{name:"H&M",pct:9},
  ],
  rising:[
    {style:"Quiet Luxury",score:88},{style:"Gorpcore",score:76},
    {style:"Ballet Core",score:72},{style:"Moto",score:65},{style:"Sheer Layers",score:61},
  ],
  declining:[
    {style:"Coastal Grandma",score:28},{style:"Cottagecore",score:35},
    {style:"Micro-Bags",score:38},{style:"Logo Mania",score:40},{style:"Neon Brights",score:44},
  ],
  prob:[
    {trend:"Stealth Wealth 2.0",prob:91},{trend:"Deconstructed Tailoring",prob:84},
    {trend:"Heritage Sportswear",prob:79},{trend:"New Minimalism",prob:73},
    {trend:"Artisan Textures",prob:68},{trend:"Dark Academia",prob:62},
  ],
  momentum:[
    {month:"Jan",Luxury:55,Street:62,Sport:70,Minimal:40},
    {month:"Feb",Luxury:58,Street:65,Sport:67,Minimal:44},
    {month:"Mar",Luxury:62,Street:60,Sport:62,Minimal:50},
    {month:"Apr",Luxury:68,Street:58,Sport:58,Minimal:56},
    {month:"May",Luxury:74,Street:55,Sport:55,Minimal:63},
    {month:"Jun",Luxury:80,Street:52,Sport:50,Minimal:70},
  ],
  bags:[
    {name:"Mini Bucket Bag",trend:"up"},{name:"Woven Tote",trend:"up"},
    {name:"Top Handle",trend:"up"},{name:"Chain Strap Mini",trend:"flat"},
    {name:"Belt Bag",trend:"down"},{name:"Micro Crossbody",trend:"down"},
  ],
  accessories:[
    {name:"Silk Headscarf",trend:"up"},{name:"Layered Necklaces",trend:"up"},
    {name:"Ballet Ribbon Ties",trend:"up"},{name:"Logo Belt",trend:"down"},
    {name:"Chunky Chain",trend:"flat"},{name:"Oversized Sunglasses",trend:"flat"},
  ],
  shoes:[
    {name:"Ballet Flats",trend:"up"},{name:"Mary Janes",trend:"up"},
    {name:"Loafers",trend:"up"},{name:"Kitten Heels",trend:"up"},
    {name:"Platform Sneakers",trend:"down"},{name:"Dad Shoes",trend:"down"},
  ],
};

// ─── Claude API ──────────────────────────────────────────────────────────
// Extracts the first valid JSON object {} or array [] from any string
function extractJSON(str) {
  if (!str) throw new Error("Empty response");
  // Try direct parse first
  try { return JSON.parse(str.trim()); } catch(_) {}
  // Strip markdown fences
  let s = str.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim();
  try { return JSON.parse(s); } catch(_) {}
  // Find first { or [ and extract balanced block
  for (const [open, close] of [["{","}"],["[","]"]]) {
    const start = s.indexOf(open);
    if (start === -1) continue;
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\" && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === open) depth++;
      if (ch === close) { depth--; if (depth === 0) {
        try { return JSON.parse(s.slice(start, i+1)); } catch(_) {}
      }}
    }
  }
  throw new Error("No valid JSON found in response");
}

async function groq(system, user) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.Groq_api_key}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      response_format: { type: "json_object" }
    }),
  });

  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(`Groq API error ${r.status}: ${errText.slice(0, 120)}`);
  }

  const d = await r.json();
  return extractJSON(d.choices[0].message.content);
}

// ══════════════════════════════════════════════════════════════
//  PURE SVG CHART COMPONENTS — zero external dependencies
// ══════════════════════════════════════════════════════════════

// Grouped vertical bar chart
function BarChartSVG({ data, keys, colors, title, subtitle }) {
  const W=480, H=200, padL=40, padB=30, padT=10, padR=10;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxVal = Math.max(...data.flatMap(d => keys.map(k => d[k]||0)), 1);
  const groupW = chartW / data.length;
  const barW = Math.max(4, (groupW / keys.length) - 3);
  const [hovered, setHovered] = useState(null);

  return (
    <div>
      <div style={{fontSize:13,fontFamily:"Georgia,serif",fontStyle:"italic",fontWeight:700,marginBottom:2}}>{title}</div>
      <div style={{fontSize:7,letterSpacing:".2em",textTransform:"uppercase",color:C.muted,marginBottom:10}}>{subtitle}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",overflow:"visible"}}>
        {/* Y gridlines */}
        {[0,25,50,75,100].map(v=>{
          const y = padT + chartH - (v/100)*chartH;
          return (
            <g key={v}>
              <line x1={padL} y1={y} x2={W-padR} y2={y} stroke={C.border} strokeWidth="0.5"/>
              <text x={padL-4} y={y+3} textAnchor="end" fontSize="7" fill={C.muted}>{v}</text>
            </g>
          );
        })}
        {/* Bars */}
        {data.map((d,gi)=>{
          const gx = padL + gi*groupW;
          return (
            <g key={gi}>
              {keys.map((k,ki)=>{
                const val = d[k]||0;
                const bh = (val/maxVal)*chartH;
                const x = gx + ki*(barW+2) + (groupW - keys.length*(barW+2))/2;
                const y = padT + chartH - bh;
                const isHov = hovered?.gi===gi && hovered?.ki===ki;
                return (
                  <g key={ki}
                    onMouseEnter={()=>setHovered({gi,ki,val,key:k,season:d.season||d.month})}
                    onMouseLeave={()=>setHovered(null)}
                    style={{cursor:"default"}}>
                    <rect x={x} y={y} width={barW} height={bh}
                      fill={colors[ki]} opacity={isHov?1:0.85} rx="1"/>
                    {isHov && (
                      <g>
                        <rect x={x-18} y={y-22} width={44} height={16} fill={C.ink} rx="2"/>
                        <text x={x+4} y={y-11} fill={C.cream} fontSize="8" textAnchor="middle">{k}: {val}</text>
                      </g>
                    )}
                  </g>
                );
              })}
              <text x={gx+groupW/2} y={H-8} textAnchor="middle" fontSize="8" fill={C.muted}>
                {d.season||d.month}
              </text>
            </g>
          );
        })}
        {/* X axis */}
        <line x1={padL} y1={padT+chartH} x2={W-padR} y2={padT+chartH} stroke={C.border} strokeWidth="1"/>
      </svg>
      {/* Legend */}
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:6}}>
        {keys.map((k,i)=>(
          <span key={k} style={{display:"flex",alignItems:"center",gap:4,fontSize:8,color:C.muted}}>
            <span style={{width:8,height:8,background:colors[i],display:"inline-block"}}/>
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

// Horizontal bar chart
function HBarChart({ data, labelKey, valueKey, color, title, subtitle }) {
  const maxVal = Math.max(...data.map(d=>d[valueKey]||0), 1);
  const [hovered, setHovered] = useState(null);
  return (
    <div>
      <div style={{fontSize:13,fontFamily:"Georgia,serif",fontStyle:"italic",fontWeight:700,marginBottom:2,color}}>{title}</div>
      <div style={{fontSize:7,letterSpacing:".2em",textTransform:"uppercase",color:C.muted,marginBottom:12}}>{subtitle}</div>
      {data.map((d,i)=>{
        const pct = ((d[valueKey]||0)/maxVal)*100;
        return (
          <div key={i} style={{marginBottom:8}}
            onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
              <span style={{fontSize:9,color:C.ink}}>{d[labelKey]}</span>
              <span style={{fontSize:9,color,fontWeight:700}}>{d[valueKey]}</span>
            </div>
            <div style={{height:6,background:C.border,borderRadius:0}}>
              <div style={{height:"100%",width:`${pct}%`,background:color,opacity:hovered===i?1:0.75,transition:"width .6s ease"}}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Donut / pie chart (pure SVG path math)
function DonutChart({ data, title, subtitle }) {
  const [hovered, setHovered] = useState(null);
  const total = data.reduce((s,d)=>s+d.pct,0)||1;
  const cx=100, cy=90, r=65, inner=38;
  let angle = -Math.PI/2;
  const slices = data.map((d,i)=>{
    const sweep = (d.pct/total)*2*Math.PI;
    const x1=cx+r*Math.cos(angle), y1=cy+r*Math.sin(angle);
    angle+=sweep;
    const x2=cx+r*Math.cos(angle), y2=cy+r*Math.sin(angle);
    const xi1=cx+inner*Math.cos(angle-sweep), yi1=cy+inner*Math.sin(angle-sweep);
    const xi2=cx+inner*Math.cos(angle), yi2=cy+inner*Math.sin(angle);
    const large = sweep>Math.PI?1:0;
    const mid = angle - sweep/2;
    return {
      path:`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${inner} ${inner} 0 ${large} 0 ${xi1} ${yi1} Z`,
      color:C.p[i%C.p.length], name:d.name, pct:d.pct, mid
    };
  });

  return (
    <div>
      <div style={{fontSize:13,fontFamily:"Georgia,serif",fontStyle:"italic",fontWeight:700,marginBottom:2}}>{title}</div>
      <div style={{fontSize:7,letterSpacing:".2em",textTransform:"uppercase",color:C.muted,marginBottom:10}}>{subtitle}</div>
      <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
        <svg viewBox="0 0 200 180" style={{width:160,height:144,flexShrink:0}}>
          {slices.map((s,i)=>(
            <path key={i} d={s.path} fill={s.color}
              opacity={hovered===null||hovered===i?1:0.5}
              stroke={C.cream} strokeWidth="1"
              style={{cursor:"default"}}
              onMouseEnter={()=>setHovered(i)}
              onMouseLeave={()=>setHovered(null)}
            />
          ))}
          {hovered!==null && (
            <text x={cx} y={cy+4} textAnchor="middle" fontSize="10" fill={C.ink} fontWeight="700">
              {slices[hovered].pct}%
            </text>
          )}
        </svg>
        <div style={{display:"flex",flexDirection:"column",gap:5}}>
          {slices.map((s,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:5,fontSize:8,
              opacity:hovered===null||hovered===i?1:0.4,cursor:"default"}}
              onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)}>
              <span style={{width:8,height:8,background:s.color,display:"inline-block",flexShrink:0}}/>
              <span style={{color:C.muted}}>{s.name}</span>
              <span style={{color:C.ink,fontWeight:700,marginLeft:"auto",paddingLeft:8}}>{s.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Line / sparkline chart
function LineChartSVG({ data, keys, colors, title, subtitle }) {
  const W=480, H=180, padL=36, padB=24, padT=10, padR=10;
  const chartW=W-padL-padR, chartH=H-padT-padB;
  const allVals = data.flatMap(d=>keys.map(k=>d[k]||0));
  const minV=Math.min(...allVals), maxV=Math.max(...allVals,1);
  const [hovered, setHovered] = useState(null);

  const px = (i) => padL + (i/(data.length-1))*chartW;
  const py = (v) => padT + chartH - ((v-minV)/(maxV-minV||1))*chartH;

  return (
    <div>
      <div style={{fontSize:13,fontFamily:"Georgia,serif",fontStyle:"italic",fontWeight:700,marginBottom:2}}>{title}</div>
      <div style={{fontSize:7,letterSpacing:".2em",textTransform:"uppercase",color:C.muted,marginBottom:10}}>{subtitle}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",overflow:"visible"}}>
        {[0,25,50,75,100].map(v=>{
          const y = padT + chartH - ((v-0)/(100))*chartH;
          return <line key={v} x1={padL} y1={y} x2={W-padR} y2={y} stroke={C.border} strokeWidth="0.5"/>;
        })}
        {keys.map((k,ki)=>{
          const pts = data.map((d,i)=>`${px(i)},${py(d[k]||0)}`).join(" ");
          return (
            <polyline key={k} points={pts} fill="none"
              stroke={colors[ki]} strokeWidth="2" strokeLinejoin="round" opacity={0.9}/>
          );
        })}
        {data.map((d,i)=>(
          <g key={i}>
            <line x1={px(i)} y1={padT} x2={px(i)} y2={padT+chartH}
              stroke={hovered===i?"rgba(0,0,0,.1)":"transparent"} strokeWidth="1"/>
            <rect x={px(i)-12} y={padT} width={24} height={chartH}
              fill="transparent" style={{cursor:"default"}}
              onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)}/>
            <text x={px(i)} y={H-6} textAnchor="middle" fontSize="8" fill={C.muted}>{d.month}</text>
            {hovered===i && (
              <g>
                <rect x={px(i)-30} y={padT} width={60} height={keys.length*13+8} fill={C.ink} rx="2"/>
                {keys.map((k2,ki2)=>(
                  <text key={k2} x={px(i)} y={padT+12+ki2*13} textAnchor="middle" fontSize="8" fill={C.p[ki2]}>
                    {k2}: {d[k2]}
                  </text>
                ))}
              </g>
            )}
          </g>
        ))}
        <line x1={padL} y1={padT+chartH} x2={W-padR} y2={padT+chartH} stroke={C.border} strokeWidth="1"/>
      </svg>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:6}}>
        {keys.map((k,i)=>(
          <span key={k} style={{display:"flex",alignItems:"center",gap:4,fontSize:8,color:C.muted}}>
            <span style={{width:16,height:2,background:colors[i],display:"inline-block"}}/>
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  OUTFIT ILLUSTRATION (SVG)
// ══════════════════════════════════════════════════════════════
function OutfitIllustration({ colors=[] }) {
  const [c0,c1,c2] = [...colors,"#c8a882","#4a4a4a","#b8974a"];
  return (
    <svg viewBox="0 0 120 160" width="80" height="107" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="60" cy="22" rx="13" ry="15" fill="#e8d0b0"/>
      <rect x="53" y="35" width="14" height="11" rx="3" fill="#e8d0b0"/>
      <path d="M 38 46 Q 34 40 60 37 Q 86 40 82 46 L 78 95 L 42 95 Z" fill={c0}/>
      <path d="M 38 46 L 22 88" stroke={c0} strokeWidth="13" strokeLinecap="round" fill="none"/>
      <path d="M 82 46 L 98 88" stroke={c0} strokeWidth="13" strokeLinecap="round" fill="none"/>
      <path d="M 42 95 L 38 138 L 56 138 L 60 110 L 64 138 L 82 138 L 78 95 Z" fill={c1}/>
      <rect x="40" y="93" width="40" height="6" rx="2" fill={c2}/>
      <ellipse cx="42" cy="138" rx="12" ry="5" fill="#222"/>
      <ellipse cx="78" cy="138" rx="12" ry="5" fill="#222"/>
      <path d="M 49 10 Q 60 4 71 10 Q 74 20 71 28" fill="#2a1a0a"/>
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════════════════════
function FashionTrendForecaster() {
  const [tab, setTab]       = useState("forecast");
  const [topics, setTopics] = useState([]);
  const [inputVal, setInputVal] = useState("");
  const [forecasts, setForecasts] = useState([]);
  const [outfits,   setOutfits]   = useState([]);
  const [dash,      setDash]      = useState(DEFAULT_DASH);
  const [stores,    setStores]    = useState([]);
  const [pins,      setPins]      = useState([]);
  const [oFilter,   setOFilter]   = useState("All");

  const [fLoading,    setFLoading]    = useState(false);
  const [oLoading,    setOLoading]    = useState(false);
  const [dashLoading, setDashLoading] = useState(false);
  const [storeLoad,   setStoreLoad]   = useState(false);
  const [pinLoad,     setPinLoad]     = useState(false);
  const [scanning,    setScanning]    = useState(false);
  const [status,      setStatus]      = useState("Ready");

  const today = new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}).toUpperCase();
  const busy = fLoading||oLoading||dashLoading||storeLoad||pinLoad||scanning;

  useEffect(()=>{
    const l = document.createElement("link");
    l.rel="stylesheet";
    l.href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,400&family=DM+Mono:wght@400;500&display=swap";
    document.head.appendChild(l);
    return ()=>{ try{document.head.removeChild(l);}catch(e){} };
  },[]);

  const addTopic = v => {
    const c=v.trim(); if(!c||topics.includes(c)) return;
    setTopics(p=>[...p,c]); setInputVal("");
  };
  const removeTopic = t => {
    setTopics(p=>p.filter(x=>x!==t));
    setForecasts(p=>p.filter(f=>f.topic!==t));
    setOutfits(p=>p.filter(o=>o.trend!==t));
  };

  const scanWeb = async()=>{
    setScanning(true); setStatus("Scanning web for trends…");
    try {
      const parsed = await groq(
        'You are a fashion analyst. Search the web for what is trending in fashion right now. You MUST return a JSON object with a "topics" array of exactly 5 short trend names. Example: {"topics":["Quiet Luxury","Gorpcore","Ballet Core","Moto Aesthetic","Sheer Layering"]}. Output ONLY the JSON object, nothing else.',
        "Search web for the 5 biggest emerging fashion trends of 2026. Short 2-3 word names only."
      );
      const found = Array.isArray(parsed) ? parsed : (parsed.topics || Object.values(parsed)[0] || []);
      const fresh = (Array.isArray(found) ? found : []).filter(t => typeof t==="string" && t.length > 0 && !topics.includes(t));
      if (fresh.length === 0) throw new Error("No new topics returned");
      setTopics(p=>[...p,...fresh]);
      setStatus(`Added ${fresh.length} topics from web`);
    } catch(e){ setStatus("Scan failed: " + e.message); }
    finally{ setScanning(false); }
  };

  const runForecast = async()=>{
    if(!topics.length) return;
    setFLoading(true); setStatus(`Forecasting ${topics.length} trend(s)…`);
    try {
      const res = await Promise.allSettled(topics.map(async topic => {
        const parsed =await groq(
          'You are a fashion trend forecaster. Use web_search to research ANY fashion topic given to you — familiar or unfamiliar. Always produce a forecast. Output ONLY a JSON object:\n{"topic":"exact topic name","category":"Style/Color/Silhouette/Material/Aesthetic/Accessory","heat":"rising","forecast":"2-3 sentence editorial forecast","signals":["signal 1","signal 2","signal 3"],"confidence":75}\nheat = hot | rising | emerging | fading. confidence = 0-100 integer.',
          `You MUST forecast this fashion topic regardless of how niche or unfamiliar it seems: "${topic}". Search the web for any signals about this trend in 2026 and produce a forecast.`
        );
        // Ensure topic field is set even if model omits it
        if (parsed && !parsed.topic) parsed.topic = topic;
        return parsed;
      }));
      const good = res.filter(r=>r.status==="fulfilled" && r.value && typeof r.value==="object").map(r=>({
        topic: r.value.topic || topics[0],
        category: r.value.category || "Style",
        heat: r.value.heat || "emerging",
        forecast: r.value.forecast || "Trend data collected.",
        signals: r.value.signals || [],
        confidence: r.value.confidence || 70,
      }));
      setForecasts(good);
      setFLoading(false);
      if (good.length > 0) {
        setStatus(`${good.length} forecasts ready — curating looks…`);
        setOLoading(true);
        const ores = await Promise.allSettled(topics.map(async topic => {
          const parsed = await groq(
            'You are a fashion stylist. Use web_search. Output ONLY a JSON object:\n{"trend":"topic","outfitName":"name","description":"2 sentences","imageSearchQuery":"search terms","colors":["#c8a882","#4a4a4a","#b8974a"],"pieces":[{"name":"item","priceRange":"$X"}],"shoppingLinks":[{"retailer":"name","url":"https://retailer.com"}],"sources":[{"publication":"Vogue","title":"article","url":"https://..."}]}\ncolors: 3 hex codes. shoppingLinks: net-a-porter.com ssense.com farfetch.com nordstrom.com asos.com zara.com hm.com. 4 pieces, 3 links, 2 sources.',
            `Curate an outfit look for the fashion trend: "${topic}" in 2026. Search for editorial inspiration and retail options.`
          );
          if (parsed && !parsed.trend) parsed.trend = topic;
          return parsed;
        }));
        const og = ores.filter(r=>r.status==="fulfilled" && r.value && typeof r.value==="object").map(r=>({
          trend: r.value.trend || topics[0],
          outfitName: r.value.outfitName || r.value.trend || "The Look",
          description: r.value.description || "",
          imageSearchQuery: r.value.imageSearchQuery || r.value.trend,
          colors: r.value.colors || ["#c8a882","#4a4a4a","#b8974a"],
          pieces: r.value.pieces || [],
          shoppingLinks: r.value.shoppingLinks || [],
          sources: r.value.sources || [],
        }));
        setOutfits(og);
        setOLoading(false);
        setStatus(`Done — ${good.length} forecasts · ${og.length} looks curated`);
      } else {
        setStatus("No forecasts returned — please try again");
      }
    } catch(e){
      setFLoading(false); setOLoading(false);
      setStatus("Error: " + e.message);
    }
  };

  const refreshDash = async()=>{
    setDashLoading(true); setStatus("Refreshing dashboard with live data…");
    try {
      const parsed = await claude(
        'You are a fashion data analyst. Search the web for 2026 fashion trend data. Output ONLY a JSON object with ALL of these keys: kpis (array of 4 objects with label/value/delta/up), seasonal (array of 4 objects with season/Casual/Formal/Street/Luxury as numbers), stores (array of 7 with name/pct), rising (array of 5 with style/score), declining (array of 5 with style/score), prob (array of 6 with trend/prob), momentum (array of 6 with month/Luxury/Street/Sport/Minimal), bags (array of 6 with name/trend), accessories (array of 6 with name/trend), shoes (array of 6 with name/trend). trend values must be up, flat, or down. All scores/pct are numbers 0-100.',
        "Search for 2026 fashion market analytics: seasonal trends, popular retailers, rising and declining styles, accessories, shoes, bags. Return the complete dashboard JSON."
      );
      // Fuzzy merge — only replace keys that exist and are valid arrays
      const merged = { ...DEFAULT_DASH };
      if (parsed && typeof parsed === "object") {
        const keys = ["kpis","seasonal","stores","rising","declining","prob","momentum","bags","accessories","shoes"];
        let updated = 0;
        keys.forEach(k => {
          if (Array.isArray(parsed[k]) && parsed[k].length > 0) {
            merged[k] = parsed[k];
            updated++;
          }
        });
        setDash(merged);
        setStatus(updated >= 5 ? "Dashboard updated with live data" : `Dashboard partially updated (${updated}/10 sections)`);
      } else {
        setStatus("Could not parse live data — showing defaults");
      }
    } catch(e){ setStatus("Refresh failed — showing defaults"); }
    finally{ setDashLoading(false); }
  };

  const loadStores = async()=>{
    setStoreLoad(true); setStatus("Finding trending stores…");
    try {
      const parsed = await groq(
        'You are a fashion retail analyst. Search the web. Output ONLY a JSON array of store objects:\n[{"name":"Store Name","category":"Luxury","priceRange":"$$$$","description":"1-2 sentences about the store.","url":"https://store.com","trendingItems":[{"name":"Item Name","price":"$99"}]}]\n8 stores total. 4 trending items each. Mix of luxury, fast fashion, streetwear, contemporary. Use real store names and real URLs.',
        "Find 8 popular and trending fashion retailers in 2026. Include their current hottest items and prices."
      );
      const arr = Array.isArray(parsed) ? parsed : (parsed.stores || parsed.results || []);
      if (arr.length > 0) { setStores(arr); setStatus("Stores loaded"); }
      else throw new Error("No stores in response");
    } catch(e){ setStatus("Store load failed: " + e.message); }
    finally{ setStoreLoad(false); }
  };

  const loadPins = async()=>{
    setPinLoad(true); setStatus("Loading outfit inspiration…");
    try {
      const q = topics.length > 0 ? topics.join(", ") : "quiet luxury, gorpcore, ballet core 2026";
      const parsed = await groq(
        'You are a fashion stylist. Search the web for outfit inspiration. Output ONLY a JSON array of 6 outfit objects:\n[{"title":"Look Name","trend":"trend name","gender":"female","description":"2 editorial sentences about the outfit.","searchQuery":"outfit search terms 2026","colors":["#hex1","#hex2","#hex3"],"shopLinks":[{"retailer":"Name","url":"https://retailer.com/path"}]}]\nIMPORTANT: Make exactly 3 female looks and 3 male looks. Set gender to "female" or "male" accordingly. 3 shopLinks each. Use real retailer domains: net-a-porter.com, ssense.com, mrporter.com, nordstrom.com, asos.com, zara.com, hm.com, farfetch.com.',
        `Find 6 Pinterest-style outfit inspirations for these fashion trends: ${q}. Return 3 female looks and 3 male looks.`
      );
      const arr = Array.isArray(parsed) ? parsed : (parsed.pins || parsed.looks || []);
      if (arr.length > 0) { setPins(arr); setStatus(`${arr.length} looks loaded`); }
      else throw new Error("No looks in response");
    } catch(e){ setStatus("Looks load failed: " + e.message); }
    finally{ setPinLoad(false); }
  };

  // ── Shared UI helpers ──────────────────────────────────────
  const heatStyle = h => ({
    hot:{bg:C.accent,cl:"white"}, rising:{bg:C.gold,cl:"white"},
    emerging:{bg:C.ink,cl:C.cream}, fading:{bg:C.border,cl:C.muted}
  }[h]||{bg:C.ink,cl:C.cream});

  const ArrIcon = ({t}) => (
    <span style={{color:t==="up"?C.up:t==="down"?C.down:C.gold,fontSize:11}}>
      {t==="up"?"↑":t==="down"?"↓":"→"}
    </span>
  );

  const oFilters=["All",...new Set(outfits.map(o=>o.trend).filter(Boolean))];
  const filteredO=oFilter==="All"?outfits:outfits.filter(o=>o.trend===oFilter);

  const TABS=[["forecast","① Forecast"],["outfits","② The Edit"],["shop","③ Shop & Stores"],["pinterest","④ Pinterest"],["dashboard","⑤ Analytics"]];

  const CardWrap = ({children, style={}}) => (
    <div style={{border:`1.5px solid ${C.border}`,padding:18,background:"white",...style}}>{children}</div>
  );

  const SecLabel = ({children}) => (
    <div style={{fontSize:8,letterSpacing:".35em",textTransform:"uppercase",color:C.muted,borderBottom:`1px solid ${C.border}`,paddingBottom:6,marginBottom:14}}>
      {children}
    </div>
  );

  // ── Static store fallback ──────────────────────────────────
  const STATIC_STORES = [
    {name:"Net-a-Porter",category:"Luxury",priceRange:"$$$$",url:"https://www.net-a-porter.com",description:"The go-to luxury destination. Current edit leans into Quiet Luxury and minimalist tailoring.",trendingItems:[{name:"Toteme Silk Wrap Blouse",price:"$420"},{name:"The Row Margaux Bag",price:"$1,890"},{name:"Vince Cashmere Sweater",price:"$385"},{name:"Khaite Denim Trousers",price:"$620"}]},
    {name:"SSENSE",category:"Luxury / Streetwear",priceRange:"$$$–$$$$",url:"https://www.ssense.com",description:"Where luxury meets cutting-edge streetwear. Best for avant-garde pieces.",trendingItems:[{name:"Acne Studios Blazer",price:"$650"},{name:"Lemaire Twisted Belt",price:"$245"},{name:"Our Legacy Trousers",price:"$310"},{name:"Paloma Wool Knit",price:"$185"}]},
    {name:"Zara",category:"Fast Fashion",priceRange:"$–$$",url:"https://www.zara.com",description:"Fastest runway-to-retail cycle. Strong on structured blazers and ballet flats right now.",trendingItems:[{name:"Structured Wool Blazer",price:"$129"},{name:"Ballet Flat Mules",price:"$59"},{name:"Satin Midi Skirt",price:"$79"},{name:"Linen Trench Coat",price:"$149"}]},
    {name:"ASOS",category:"Contemporary",priceRange:"$–$$",url:"https://www.asos.com",description:"Trend-forward pieces at accessible prices with strong inclusive sizing.",trendingItems:[{name:"Oversized Trench",price:"$89"},{name:"Mary Jane Heels",price:"$45"},{name:"Sheer Layering Top",price:"$38"},{name:"Wide Leg Trousers",price:"$55"}]},
  ];

  const displayStores = stores.length > 0 ? stores : STATIC_STORES;

  // ─────────────────────────────────────────────────────────
  return (
    <div style={{background:C.cream,fontFamily:"'DM Mono',monospace",color:C.ink,minHeight:"100vh"}}>

      {/* MASTHEAD */}
      <div style={{borderBottom:`2.5px solid ${C.ink}`,padding:"13px 32px",display:"flex",alignItems:"baseline",gap:12,position:"sticky",top:0,background:C.cream,zIndex:60}}>
        <div>
          <div style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize:22,fontWeight:900,letterSpacing:-.5}}>Horizon Retail</div>
          <div style={{fontSize:8,letterSpacing:".3em",textTransform:"uppercase",color:C.muted}}>AI Fashion Trend Intelligence</div>
        </div>
        <span style={{fontSize:7,letterSpacing:".2em",textTransform:"uppercase",padding:"3px 8px",border:`1px solid ${C.gold}`,color:C.gold,marginLeft:8}}>Portfolio Project</span>
        <div style={{marginLeft:"auto",fontSize:8,letterSpacing:".15em",color:C.muted,textTransform:"uppercase"}}>{today}</div>
      </div>

      {/* TABS */}
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:C.cream,position:"sticky",top:52,zIndex:50,overflowX:"auto"}}>
        {TABS.map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} style={{padding:"10px 18px",fontSize:9,letterSpacing:".22em",textTransform:"uppercase",cursor:"pointer",border:"none",background:"transparent",color:tab===id?C.ink:C.muted,borderBottom:tab===id?`2px solid ${C.accent}`:"2px solid transparent",fontFamily:"monospace",whiteSpace:"nowrap",transition:"all .15s"}}>
            {lbl}
          </button>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 270px",minHeight:"calc(100vh - 94px)"}}>
        <div style={{borderRight:`1px solid ${C.border}`,padding:"24px 28px"}}>

          {/* ══ FORECAST ══════════════════════════════════════ */}
          {tab==="forecast" && (
            <div>
              <SecLabel>Track a Trend</SecLabel>
              <div style={{display:"flex",marginBottom:16,border:`1.5px solid ${C.ink}`}}>
                <input style={{flex:1,border:"none",background:"transparent",padding:"10px 12px",fontFamily:"monospace",fontSize:12,color:C.ink,outline:"none"}}
                  placeholder="e.g. Ballet Core, Quiet Luxury, Raw Denim…"
                  value={inputVal} onChange={e=>setInputVal(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&addTopic(inputVal)}/>
                <button onClick={()=>addTopic(inputVal)} style={{padding:"10px 16px",background:C.ink,color:C.cream,border:"none",fontFamily:"monospace",fontSize:9,letterSpacing:".2em",textTransform:"uppercase",cursor:"pointer"}}>+ Add</button>
              </div>

              {topics.length>0&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
                  {topics.map(t=>(
                    <span key={t} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 10px",border:`1px solid ${C.border}`,fontSize:9,background:"white"}}>
                      {t}<span onClick={()=>removeTopic(t)} style={{cursor:"pointer",color:C.muted,fontSize:13}}>×</span>
                    </span>
                  ))}
                </div>
              )}

              {topics.length>0&&(
                <button onClick={runForecast} disabled={busy}
                  style={{padding:"10px 22px",background:busy?"#999":C.ink,color:C.cream,border:"none",fontFamily:"monospace",fontSize:9,letterSpacing:".2em",textTransform:"uppercase",cursor:busy?"not-allowed":"pointer",marginBottom:22}}>
                  {fLoading?"⟳ Analyzing…":oLoading?"⟳ Building looks…":`▶ Forecast + Build Looks (${topics.length})`}
                </button>
              )}

              <SecLabel>Trend Forecasts</SecLabel>
              {fLoading&&<div style={{color:C.muted,fontSize:11,padding:"20px 0"}}>⟳ Searching web for trend signals — takes ~20s…</div>}
              {!fLoading&&forecasts.length===0&&(
                <div style={{textAlign:"center",padding:"48px 20px"}}>
                  <div style={{fontFamily:"Georgia,serif",fontSize:24,fontStyle:"italic",color:C.border,marginBottom:7}}>What's Next?</div>
                  <div style={{fontSize:9,letterSpacing:".15em",textTransform:"uppercase",color:C.muted}}>Add topics then click Forecast + Build Looks</div>
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
                {forecasts.map((f,i)=>{
                  const hs=heatStyle(f.heat);
                  return (
                    <div key={i} style={{border:`1.5px solid ${C.ink}`,padding:16,background:"white",position:"relative"}}>
                      <span style={{position:"absolute",top:10,right:10,fontSize:7,letterSpacing:".2em",textTransform:"uppercase",padding:"2px 6px",background:hs.bg,color:hs.cl}}>
                        {f.heat==="hot"?"🔥 Hot":f.heat==="rising"?"↑ Rising":f.heat==="emerging"?"◆ Emerging":"↓ Fading"}
                      </span>
                      <div style={{fontFamily:"Georgia,serif",fontSize:17,fontWeight:700,fontStyle:"italic",lineHeight:1.1,marginBottom:4,paddingRight:65}}>{f.topic}</div>
                      <div style={{fontSize:7,letterSpacing:".25em",textTransform:"uppercase",color:C.muted,marginBottom:10}}>{f.category}</div>
                      <div style={{fontFamily:"Georgia,serif",fontSize:13,lineHeight:1.65,color:"#2a2a2a",marginBottom:10}}>{f.forecast}</div>
                      <div style={{borderTop:`1px solid ${C.border}`,paddingTop:8,display:"flex",flexDirection:"column",gap:4}}>
                        {(f.signals||[]).map((s,j)=>(
                          <div key={j} style={{display:"flex",alignItems:"center",gap:6,fontSize:9,color:C.muted}}>
                            <span style={{width:4,height:4,borderRadius:"50%",background:C.gold,flexShrink:0,display:"inline-block"}}/>
                            {s}
                          </div>
                        ))}
                      </div>
                      <div style={{height:2,background:C.border,marginTop:10,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${f.confidence||0}%`,background:C.accent}}/>
                      </div>
                      <div style={{fontSize:7,letterSpacing:".15em",color:C.muted,marginTop:3,textTransform:"uppercase"}}>Confidence: {f.confidence}%</div>
                    </div>
                  );
                })}
              </div>
              {oLoading&&<div style={{color:C.muted,fontSize:11,padding:"8px 0"}}>⟳ Curating outfit looks…</div>}
              <div style={{display:"flex",alignItems:"center",gap:7,marginTop:6}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:busy?C.accent:C.muted}}/>
                <span style={{fontSize:9,color:C.muted}}>{status}</span>
              </div>
            </div>
          )}

          {/* ══ THE EDIT ══════════════════════════════════════ */}
          {tab==="outfits" && (
            <div>
              <div style={{fontFamily:"Georgia,serif",fontSize:24,fontWeight:900,marginBottom:4}}>The Edit</div>
              <div style={{fontSize:8,letterSpacing:".25em",textTransform:"uppercase",color:C.muted,marginBottom:18}}>AI-curated looks · editorial sources · retail links</div>
              {outfits.length===0&&!oLoading&&(
                <div style={{textAlign:"center",padding:"48px 20px"}}>
                  <div style={{fontFamily:"Georgia,serif",fontSize:24,fontStyle:"italic",color:C.border,marginBottom:7}}>No Looks Yet</div>
                  <div style={{fontSize:9,letterSpacing:".15em",textTransform:"uppercase",color:C.muted}}>Go to Tab ① → add topics → Forecast + Build Looks</div>
                </div>
              )}
              {oLoading&&<div style={{color:C.muted,fontSize:11,padding:"20px 0"}}>⟳ Curating outfit looks…</div>}
              {outfits.length>0&&(
                <div style={{display:"flex",gap:7,marginBottom:18,flexWrap:"wrap"}}>
                  {oFilters.map(n=>(
                    <button key={n} onClick={()=>setOFilter(n)} style={{padding:"5px 13px",border:`1px solid ${oFilter===n?C.ink:C.border}`,fontSize:8,letterSpacing:".2em",textTransform:"uppercase",cursor:"pointer",background:oFilter===n?C.ink:"white",color:oFilter===n?C.cream:C.ink,fontFamily:"monospace"}}>
                      {n}
                    </button>
                  ))}
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(255px,1fr))",gap:18}}>
                {filteredO.map((o,i)=>{
                  const pal=o.colors||["#c8a882","#4a4a4a","#b8974a"];
                  return (
                    <div key={i} style={{border:`1.5px solid ${C.border}`,background:"white",overflow:"hidden"}}>
                      <div style={{height:155,background:`linear-gradient(135deg,${pal[0]}33,${pal[1]}44)`,position:"relative",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:6}}>
                        <OutfitIllustration colors={pal}/>
                        <span style={{position:"absolute",top:8,left:8,fontSize:7,letterSpacing:".15em",textTransform:"uppercase",padding:"3px 7px",background:C.ink,color:C.cream}}>{o.trend}</span>
                        {o.imageSearchQuery&&(
                          <a href={`https://www.google.com/search?q=${encodeURIComponent(o.imageSearchQuery)}&tbm=isch`} target="_blank" rel="noopener noreferrer"
                            style={{position:"absolute",bottom:8,right:8,fontSize:7,letterSpacing:".12em",textTransform:"uppercase",padding:"3px 8px",border:`1px solid ${C.gold}`,color:C.gold,textDecoration:"none",background:"rgba(245,240,232,.9)"}}>
                            ↗ Images
                          </a>
                        )}
                      </div>
                      <div style={{padding:14}}>
                        <div style={{fontFamily:"Georgia,serif",fontSize:15,fontWeight:700,fontStyle:"italic",marginBottom:3}}>{o.outfitName}</div>
                        <div style={{fontFamily:"Georgia,serif",fontSize:12,lineHeight:1.6,color:"#3a3a3a",marginBottom:10}}>{o.description}</div>
                        <div style={{display:"flex",gap:5,marginBottom:10}}>
                          {pal.map((c,j)=><span key={j} style={{width:14,height:14,borderRadius:"50%",background:c,border:`1px solid ${C.border}`,display:"inline-block"}}/>)}
                        </div>
                        {(o.pieces||[]).length>0&&(
                          <div style={{marginBottom:12}}>
                            <div style={{fontSize:7,letterSpacing:".25em",textTransform:"uppercase",color:C.muted,marginBottom:6}}>Key Pieces</div>
                            {o.pieces.map((p,j)=>(
                              <div key={j} style={{display:"flex",alignItems:"center",gap:7,padding:"4px 0",borderBottom:j<o.pieces.length-1?`1px solid ${C.warm}`:"none"}}>
                                <span style={{flex:1,fontSize:10}}>{p.name}</span>
                                <span style={{fontSize:9,color:C.gold}}>{p.priceRange}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {(o.shoppingLinks||[]).length>0&&(
                          <div style={{marginBottom:10}}>
                            <div style={{fontSize:7,letterSpacing:".25em",textTransform:"uppercase",color:C.muted,marginBottom:6}}>Shop the Look</div>
                            <div style={{display:"flex",flexWrap:"wrap"}}>
                              {o.shoppingLinks.map((l,j)=>(
                                <a key={j} href={l.url} target="_blank" rel="noopener noreferrer"
                                  style={{display:"inline-flex",alignItems:"center",gap:3,padding:"4px 9px",border:`1px solid ${C.border}`,fontSize:8,letterSpacing:".12em",textTransform:"uppercase",textDecoration:"none",color:C.ink,marginRight:5,marginBottom:5}}>
                                  ↗ {l.retailer}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                        {(o.sources||[]).length>0&&(
                          <div style={{borderTop:`1px solid ${C.border}`,paddingTop:9}}>
                            <div style={{fontSize:7,letterSpacing:".2em",textTransform:"uppercase",color:C.muted,marginBottom:5}}>Editorial Sources</div>
                            {o.sources.map((s,j)=>(
                              <div key={j} style={{display:"flex",alignItems:"baseline",gap:5,fontSize:9,color:C.muted,marginBottom:2}}>
                                <span>—</span>
                                <span><span style={{fontStyle:"italic",color:C.ink}}>{s.publication}</span>
                                {s.url&&<a href={s.url} target="_blank" rel="noopener noreferrer" style={{color:C.gold,textDecoration:"none",marginLeft:4,fontSize:8}}>↗</a>}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══ SHOP & STORES ════════════════════════════════ */}
          {tab==="shop" && (
            <div>
              <div style={{fontFamily:"Georgia,serif",fontSize:24,fontWeight:900,marginBottom:4}}>Shop & Stores</div>
              <div style={{fontSize:8,letterSpacing:".25em",textTransform:"uppercase",color:C.muted,marginBottom:18}}>Trending retailers · current hot items · live prices</div>
              <button onClick={loadStores} disabled={storeLoad}
                style={{padding:"9px 20px",background:"transparent",border:`1.5px solid ${C.accent}`,color:C.accent,fontFamily:"monospace",fontSize:9,letterSpacing:".2em",textTransform:"uppercase",cursor:storeLoad?"not-allowed":"pointer",opacity:storeLoad?.5:1,marginBottom:22}}>
                {storeLoad?"⟳ Loading…":"⟳ Load Live Store Data"}
              </button>
              {storeLoad&&<div style={{color:C.muted,fontSize:11,padding:"10px 0"}}>⟳ Searching web for trending stores and prices…</div>}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                {displayStores.map((s,i)=>(
                  <div key={i} style={{border:`1.5px solid ${C.border}`,background:"white",padding:16}}>
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
                      <div>
                        <div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700,fontStyle:"italic",marginBottom:2}}>{s.name}</div>
                        <div style={{fontSize:8,letterSpacing:".2em",textTransform:"uppercase",color:C.muted}}>{s.category}</div>
                      </div>
                      <div style={{fontSize:9,padding:"3px 8px",background:C.ink,color:C.cream,whiteSpace:"nowrap"}}>{s.priceRange}</div>
                    </div>
                    <div style={{fontFamily:"Georgia,serif",fontSize:12,lineHeight:1.6,color:"#3a3a3a",marginBottom:12}}>{s.description}</div>
                    <div style={{fontSize:7,letterSpacing:".25em",textTransform:"uppercase",color:C.muted,marginBottom:7}}>Trending Items Now</div>
                    {(s.trendingItems||[]).map((item,j)=>(
                      <div key={j} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"5px 0",borderBottom:j<(s.trendingItems.length-1)?`1px solid ${C.warm}`:"none"}}>
                        <span style={{fontSize:10}}>{item.name||item.n}</span>
                        <span style={{fontSize:9,color:C.gold}}>{item.price||item.p}</span>
                      </div>
                    ))}
                    <a href={s.url} target="_blank" rel="noopener noreferrer"
                      style={{display:"inline-flex",alignItems:"center",gap:4,padding:"6px 14px",border:`1px solid ${C.ink}`,fontSize:9,letterSpacing:".15em",textTransform:"uppercase",textDecoration:"none",color:C.ink,marginTop:12}}>
                      ↗ Shop {s.name}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ PINTEREST ════════════════════════════════════ */}
          {tab==="pinterest" && (
            <div>
              <div style={{fontFamily:"Georgia,serif",fontSize:24,fontWeight:900,marginBottom:4}}>Pinterest Looks</div>
              <div style={{fontSize:8,letterSpacing:".25em",textTransform:"uppercase",color:C.muted,marginBottom:18}}>Female & male outfit inspiration · AI-illustrated · shop similar</div>
              <button onClick={loadPins} disabled={pinLoad}
                style={{padding:"9px 20px",background:"transparent",border:"1.5px solid #E60023",color:"#E60023",fontFamily:"monospace",fontSize:9,letterSpacing:".2em",textTransform:"uppercase",cursor:pinLoad?"not-allowed":"pointer",opacity:pinLoad?.5:1,marginBottom:22}}>
                {pinLoad?"⟳ Finding looks…":"📌 Load Outfit Inspiration"}
              </button>
              {topics.length>0&&<div style={{fontSize:9,color:C.muted,marginBottom:14}}>Pulling looks for: {topics.join(", ")}</div>}
              {pinLoad&&<div style={{color:C.muted,fontSize:11,padding:"10px 0"}}>⟳ Searching for outfit inspiration…</div>}
              {pins.length===0&&!pinLoad&&(
                <div style={{textAlign:"center",padding:"48px 20px"}}>
                  <div style={{fontFamily:"Georgia,serif",fontSize:24,fontStyle:"italic",color:C.border,marginBottom:7}}>No Pins Yet</div>
                  <div style={{fontSize:9,letterSpacing:".15em",textTransform:"uppercase",color:C.muted}}>Click the button above to load inspiration</div>
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(248px,1fr))",gap:18}}>
                {pins.map((pin,i)=>{
                  const pal=pin.colors||["#c8a882","#4a4a4a","#b8974a"];
                  return (
                    <div key={i} style={{border:`1.5px solid ${C.border}`,background:"white",overflow:"hidden"}}>
                      <div style={{height:155,background:`linear-gradient(135deg,${pal[0]}33,${pal[1]}44)`,position:"relative",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:6}}>
                        <OutfitIllustration colors={pal}/>
                        <span style={{position:"absolute",top:8,left:8,fontSize:7,letterSpacing:".15em",textTransform:"uppercase",padding:"3px 7px",background:"#E60023",color:"white"}}>📌 Pinterest</span>
                        <span style={{position:"absolute",top:8,right:8,fontSize:7,letterSpacing:".15em",textTransform:"uppercase",padding:"3px 7px",background:pin.gender==="male"?C.ink:"#8a4a6a",color:"white"}}>{pin.gender==="male"?"♂ Mens":"♀ Womens"}</span>
                        <a href={`https://www.pinterest.com/search/pins/?q=${encodeURIComponent(pin.searchQuery||pin.title)}`} target="_blank" rel="noopener noreferrer"
                          style={{position:"absolute",bottom:8,right:8,fontSize:7,letterSpacing:".12em",textTransform:"uppercase",padding:"3px 8px",border:`1px solid ${C.gold}`,color:C.gold,textDecoration:"none",background:"rgba(245,240,232,.9)"}}>
                          ↗ View on Pinterest
                        </a>
                      </div>
                      <div style={{padding:14}}>
                        <div style={{fontFamily:"Georgia,serif",fontSize:15,fontWeight:700,fontStyle:"italic",marginBottom:3}}>{pin.title}</div>
                        <div style={{fontSize:8,letterSpacing:".2em",textTransform:"uppercase",color:C.muted,marginBottom:8}}>{pin.trend}</div>
                        <div style={{fontFamily:"Georgia,serif",fontSize:12,lineHeight:1.6,color:"#3a3a3a",marginBottom:10}}>{pin.description}</div>
                        <div style={{display:"flex",gap:5,marginBottom:10}}>
                          {pal.map((c,j)=><span key={j} style={{width:14,height:14,borderRadius:"50%",background:c,border:`1px solid ${C.border}`,display:"inline-block"}}/>)}
                        </div>
                        {(pin.shopLinks||[]).map((l,j)=>(
                          <a key={j} href={l.url} target="_blank" rel="noopener noreferrer"
                            style={{display:"inline-flex",alignItems:"center",gap:3,padding:"4px 9px",border:`1px solid ${C.border}`,fontSize:8,letterSpacing:".12em",textTransform:"uppercase",textDecoration:"none",color:C.ink,marginRight:5,marginBottom:5}}>
                            ↗ {l.retailer}
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══ ANALYTICS DASHBOARD — pure SVG, zero Recharts ═ */}
          {tab==="dashboard" && (
            <div>
              <div style={{fontFamily:"Georgia,serif",fontSize:24,fontWeight:900,marginBottom:4}}>Analytics Dashboard</div>
              <div style={{fontSize:8,letterSpacing:".3em",textTransform:"uppercase",color:C.muted,marginBottom:18}}>Fashion Intelligence · SS 2026</div>

              <button onClick={refreshDash} disabled={dashLoading}
                style={{padding:"9px 20px",background:"transparent",border:`1.5px solid ${C.accent}`,color:C.accent,fontFamily:"monospace",fontSize:9,letterSpacing:".2em",textTransform:"uppercase",cursor:dashLoading?"not-allowed":"pointer",opacity:dashLoading?.5:1,marginBottom:22}}>
                {dashLoading?"⟳ Fetching live data…":"⟳ Refresh with Live Web Data"}
              </button>

              {/* KPIs */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:22}}>
                {dash.kpis.map((k,i)=>(
                  <div key={i} style={{border:`1.5px solid ${C.ink}`,padding:14,background:"white"}}>
                    <div style={{fontFamily:"Georgia,serif",fontSize:24,fontWeight:900,lineHeight:1,marginBottom:3}}>{k.value}</div>
                    <div style={{fontSize:7,letterSpacing:".25em",textTransform:"uppercase",color:C.muted}}>{k.label}</div>
                    <div style={{fontSize:9,marginTop:4,color:k.up?C.up:C.down}}>{k.up?"↑":"↓"} {k.delta}</div>
                  </div>
                ))}
              </div>

              {/* Seasonal grouped bars + Store donut */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                <CardWrap>
                  <BarChartSVG
                    data={dash.seasonal} keys={["Casual","Formal","Street","Luxury"]}
                    colors={["#c8431a","#b8974a","#2d7a4f","#5b6fa6"]}
                    title="Seasonal Wear Trends" subtitle="Style category index by season"/>
                </CardWrap>
                <CardWrap>
                  <DonutChart data={dash.stores} title="Store Popularity" subtitle="Share of trend coverage · %"/>
                </CardWrap>
              </div>

              {/* Momentum line chart */}
              <CardWrap style={{marginBottom:16}}>
                <LineChartSVG
                  data={dash.momentum} keys={["Luxury","Street","Sport","Minimal"]}
                  colors={["#c8431a","#b8974a","#2d7a4f","#5b6fa6"]}
                  title="Style Momentum · 6-Month Index" subtitle="Hover months for details"/>
              </CardWrap>

              {/* Rising + Declining */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                <CardWrap>
                  <HBarChart data={dash.rising} labelKey="style" valueKey="score"
                    color={C.up} title="↑ Rising Styles" subtitle="Trend momentum score 0–100"/>
                </CardWrap>
                <CardWrap>
                  <HBarChart data={dash.declining} labelKey="style" valueKey="score"
                    color={C.down} title="↓ Declining Styles" subtitle="Trend momentum score 0–100"/>
                </CardWrap>
              </div>

              {/* Probability dark panel */}
              <div style={{border:`1.5px solid ${C.ink}`,padding:18,background:C.ink,color:C.cream,marginBottom:16}}>
                <div style={{fontFamily:"Georgia,serif",fontSize:15,fontWeight:700,fontStyle:"italic",marginBottom:3,color:C.cream}}>Probability: What Trends Next</div>
                <div style={{fontSize:7,letterSpacing:".2em",textTransform:"uppercase",color:"rgba(245,240,232,.4)",marginBottom:18}}>AI-modeled breakout likelihood · next 2 seasons</div>
                {dash.prob.map((t,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    <span style={{flex:"0 0 180px",fontSize:10,letterSpacing:".04em"}}>{t.trend}</span>
                    <div style={{flex:2,height:6,background:"rgba(255,255,255,.1)"}}>
                      <div style={{height:"100%",width:`${t.prob}%`,background:C.p[i%C.p.length],transition:"width .8s ease"}}/>
                    </div>
                    <span style={{fontSize:10,minWidth:34,textAlign:"right",color:C.gold}}>{t.prob}%</span>
                  </div>
                ))}
              </div>

              {/* Accessories grid */}
              <SecLabel>Accessories Intelligence</SecLabel>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:18}}>
                {[["👜 Bags","bags"],["✦ Accessories","accessories"],["👟 Shoes","shoes"]].map(([title,key])=>(
                  <div key={key} style={{border:`1.5px solid ${C.border}`,padding:12,background:"white"}}>
                    <div style={{fontSize:8,letterSpacing:".25em",textTransform:"uppercase",color:C.muted,marginBottom:8}}>{title}</div>
                    {(dash[key]||[]).map((item,j)=>(
                      <div key={j} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0",borderBottom:j<dash[key].length-1?`1px solid ${C.warm}`:"none",fontSize:10}}>
                        <span style={{fontSize:9,flex:1}}>{item.name}</span>
                        <span style={{color:item.trend==="up"?C.up:item.trend==="down"?C.down:C.gold,fontSize:11}}>
                          {item.trend==="up"?"↑":item.trend==="down"?"↓":"→"}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div style={{display:"flex",alignItems:"center",gap:7}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:dashLoading?C.accent:C.muted}}/>
                <span style={{fontSize:9,color:C.muted}}>{dashLoading?"Fetching live data…":status}</span>
              </div>
            </div>
          )}
        </div>

        {/* SIDEBAR */}
        <div style={{padding:"20px 16px",background:C.warm}}>
          <div style={{border:`1.5px solid ${C.ink}`,padding:14,background:C.ink,color:C.cream,marginBottom:14}}>
            <div style={{fontSize:7,letterSpacing:".3em",textTransform:"uppercase",color:C.gold,marginBottom:5}}>Season Outlook · SS 2026</div>
            <div style={{fontFamily:"Georgia,serif",fontSize:13,fontStyle:"italic",lineHeight:1.5}}>Heritage textiles, deconstructed tailoring, and earthy pigments dominate runway direction.</div>
          </div>
          <button onClick={scanWeb} disabled={busy}
            style={{width:"100%",padding:10,background:"transparent",border:`1.5px solid ${C.accent}`,color:C.accent,fontFamily:"monospace",fontSize:9,letterSpacing:".2em",textTransform:"uppercase",cursor:busy?"not-allowed":"pointer",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6,opacity:busy?.5:1}}>
            {scanning?"⟳ Scanning…":"⟳ Web Scan for Trends"}
          </button>
          <SecLabel>Trending Now</SecLabel>
          {SEED_TRENDS.map((t,i)=>(
            <div key={t.name} onClick={()=>addTopic(t.name)}
              style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}>
              <span style={{fontSize:8,color:C.muted,minWidth:14}}>0{i+1}</span>
              <span style={{fontFamily:"Georgia,serif",fontSize:13,fontWeight:600,flex:1,lineHeight:1.2}}>{t.name}</span>
              <span style={{fontSize:10,color:t.arrow==="up"?C.accent:t.arrow==="down"?C.muted:C.gold}}>
                {t.arrow==="up"?"↑":t.arrow==="down"?"↓":"→"}
              </span>
            </div>
          ))}
          <hr style={{border:"none",borderTop:`1px solid ${C.border}`,margin:"14px 0"}}/>
          <SecLabel>How to Use</SecLabel>
          <div style={{fontSize:9,lineHeight:1.9,color:C.muted}}>
            <p>① Add trends or <b style={{color:C.ink}}>Web Scan</b></p>
            <p>② Hit <b style={{color:C.ink}}>Forecast + Build Looks</b></p>
            <p>③ Browse <b style={{color:C.ink}}>The Edit</b> for outfits</p>
            <p>④ Find stores in <b style={{color:C.ink}}>Shop & Stores</b></p>
            <p>⑤ Load <b style={{color:C.ink}}>Pinterest</b> inspiration</p>
            <p>⑥ View <b style={{color:C.ink}}>Analytics</b> charts</p>
          </div>
          <hr style={{border:"none",borderTop:`1px solid ${C.border}`,margin:"14px 0"}}/>
          <SecLabel>Tech Stack</SecLabel>
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:4}}>
            {["Anthropic API","Web Search","Custom SVG Charts","React","Data Viz"].map(t=>(
              <span key={t} style={{fontSize:7,letterSpacing:".12em",textTransform:"uppercase",padding:"3px 7px",border:`1px solid ${C.border}`,color:C.muted}}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<FashionTrendForecaster />);
