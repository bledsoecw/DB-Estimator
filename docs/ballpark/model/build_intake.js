// Build a site-visit intake sheet from a JSON spec: node build_intake.js intake_kitchen.json
// Needs the docx npm package (npm install docx@9).
const fs=require('fs'), path=require('path');
const {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,WidthType,ShadingType,AlignmentType,BorderStyle,Footer,PageNumber}=require('docx');
const spec=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const FONT='Arial', MONO='Courier New', W=11520;
const border={style:BorderStyle.SINGLE,size:4,color:'A6A6A6'}, borders={top:border,bottom:border,left:border,right:border};
const NONE={style:BorderStyle.NONE,size:0,color:'FFFFFF'};
const NAVY='1F3864', GREYTXT='666666', FILL='DCE6F1', box='☐';
const t=(text,o={})=>new TextRun({text,font:o.mono?MONO:FONT,size:o.size||18,bold:o.bold,color:o.color});
const p=(runs,o={})=>new Paragraph({children:Array.isArray(runs)?runs:[runs],spacing:{before:o.before??0,after:o.after??40},alignment:o.align,keepNext:o.keepNext});
const cell=(children,w,o={})=>new TableCell({width:{size:w,type:WidthType.DXA},borders,shading:o.fill?{fill:o.fill,type:ShadingType.CLEAR,color:'auto'}:undefined,margins:{top:35,bottom:35,left:90,right:90},children:Array.isArray(children)?children:[children],columnSpan:o.span});
const heading=txt=>new Paragraph({children:[t(txt,{bold:true,size:20,color:NAVY})],spacing:{before:110,after:40},keepNext:true,border:{bottom:{style:BorderStyle.SINGLE,size:6,color:NAVY,space:2}}});
const table=(cols,rows)=>new Table({width:{size:W,type:WidthType.DXA},columnWidths:cols,rows});
const label=(l,v,w,o={})=>cell([p(t(l,{size:14,color:GREYTXT})),p(t(v,{size:v===' '?22:18}))],w,o);
const COLS=[2700,2700,6120];
const fieldTable=rows=>table(COLS,[new TableRow({tableHeader:true,children:['Measurement','Enter','How to count  ·  JobTread parameter'].map((h,i)=>cell(p(t(h,{bold:true,size:16})),COLS[i],{fill:FILL}))}),
  ...rows.map(([m,enter,how,param])=>new TableRow({cantSplit:true,children:[cell(p(t(m,{bold:true,size:17})),COLS[0]),cell(p(t(enter,{size:17,color:'404040'})),COLS[1]),
    cell([p(t(how,{size:16})),...(param?[p(t(param,{mono:true,size:15,color:GREYTXT}),{after:0})]:[])],COLS[2])]}))]);
const room=spec.room, lower=room.toLowerCase();
const children=[
  p(t('DEITEMEYER BROTHERS',{bold:true,size:16,color:NAVY}),{after:0}),
  p(t(`${room} Site-Visit Intake`,{bold:true,size:32}),{after:20}),
  p(t(spec.intro,{size:17,color:'404040'}),{after:100}),
  table([2880,2880,2880,2880],[new TableRow({children:['Job #','Customer','Date of visit','Sales rep'].map(h=>label(h,' ',2880))}),
    new TableRow({children:[label('Property address',' ',5760,{span:2}),label('Photos uploaded to CompanyCam',box+' Yes',2880),label(spec.which,' ',2880)]})]),
  heading('1  Does this project need the design step?'),
  p(t('If any answer is Yes, the next step after the budget range is the Design & Pricing Agreement. If every answer is No, it goes straight from the budget range to a fixed-price proposal.',{size:16,color:'404040'}),{after:60}),
  table([8520,1500,1500],[new TableRow({children:[cell(p(t('Does any of this apply?',{bold:true,size:16})),8520,{fill:FILL}),...['Yes','No'].map(h=>cell(p(t(h,{bold:true,size:16}),{align:AlignmentType.CENTER}),1500,{fill:FILL}))]}),
    ...spec.screen.map(q=>new TableRow({cantSplit:true,children:[cell(p(t(q,{size:17})),8520),...[0,1].map(()=>cell(p(t(box,{size:22}),{align:AlignmentType.CENTER}),1500))]}))]),
];
let n=2;
for(const [title,rows] of spec.sections){children.push(heading(`${n++}  ${title}`),fieldTable(rows));}
const TC=[1500,3340,3340,3340];
children.push(heading(`${n++}  What the customer wants`),
  p(t('Tick the level the customer leans toward. The ballpark shows all three, but this tells the estimator which one to lead with.',{size:16,color:'404040'}),{after:60}),
  table(TC,[new TableRow({children:[cell(p(t('',{size:16})),TC[0],{fill:FILL}),...['Good','Better','Best'].map((h,i)=>cell(p(t(box+'  '+h,{bold:true,size:18})),TC[i+1],{fill:FILL}))]}),
    ...spec.tiers.map(r=>new TableRow({cantSplit:true,children:r.map((x,i)=>cell(p(t(x,{size:16,bold:i===0})),TC[i]))}))]),
  p(t(' ',{size:8}),{after:40}),
  table([3840,3840,3840],[new TableRow({cantSplit:true,children:[label('Budget the customer mentioned','$',3840),label('Hoped-for start',' ',3840),label('Decision-makers present',box+' All   '+box+' Not all',3840)]})]),
  heading(`${n++}  Photos and notes`),
  p(t(spec.photos.map(x=>box+' '+x).join('   '),{size:17}),{after:60}),
  p(t('Must-haves, concerns, anything unusual:',{size:16,color:GREYTXT}),{after:0}),
  table([W],Array.from({length:3},()=>new TableRow({height:{value:380,rule:'atLeast'},children:[new TableCell({width:{size:W,type:WidthType.DXA},borders:{top:NONE,left:NONE,right:NONE,bottom:border},children:[p(t(' ',{size:18}))]})]}))));
const foot=new Footer({children:[new Paragraph({children:[t(`DRAFT 27 Sep 2026 · After the visit, enter each value into the job’s JobTread parameters, then add the "BALLPARK — ${room}" cost group.   Page `,{size:14,color:GREYTXT}),
  new TextRun({children:[PageNumber.CURRENT],font:FONT,size:14,color:GREYTXT}),t(' of ',{size:14,color:GREYTXT}),new TextRun({children:[PageNumber.TOTAL_PAGES],font:FONT,size:14,color:GREYTXT})]})]});
const doc=new Document({styles:{default:{document:{run:{font:FONT,size:18}}}},
  sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:620,bottom:620,left:720,right:720}}},footers:{default:foot},children}]});
Packer.toBuffer(doc).then(b=>{const out=path.join(__dirname,'..',spec.filename);fs.writeFileSync(out,b);console.log(out);});
