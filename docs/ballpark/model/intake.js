const fs=require('fs');
const {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,WidthType,ShadingType,AlignmentType,BorderStyle,Footer,PageNumber,TabStopType}=require('docx');
const FONT='Arial', MONO='Courier New';
const W=11520; // 8.5in - 2*0.5in margins
const border={style:BorderStyle.SINGLE,size:4,color:'A6A6A6'};
const borders={top:border,bottom:border,left:border,right:border};
const NAVY='1F3864', GREYTXT='666666', FILL='DCE6F1', BOXFILL='FFFFFF';
function t(text,o={}){return new TextRun({text,font:o.mono?MONO:FONT,size:o.size||18,bold:o.bold,color:o.color,italics:o.italics});}
function p(runs,o={}){return new Paragraph({children:Array.isArray(runs)?runs:[runs],spacing:{before:o.before??0,after:o.after??40},alignment:o.align,keepNext:o.keepNext});}
function cell(children,w,o={}){return new TableCell({width:{size:w,type:WidthType.DXA},borders,shading:o.fill?{fill:o.fill,type:ShadingType.CLEAR,color:'auto'}:undefined,margins:{top:35,bottom:35,left:90,right:90},children:Array.isArray(children)?children:[children],columnSpan:o.span,verticalAlign:o.valign});}
function heading(txt){return new Paragraph({children:[t(txt,{bold:true,size:20,color:NAVY})],spacing:{before:110,after:40},keepNext:true,border:{bottom:{style:BorderStyle.SINGLE,size:6,color:NAVY,space:2}}});}
const COLS=[2700,2700,6120];
function fieldTable(rows){
  const head=new TableRow({tableHeader:true,children:[cell(p(t('Measurement',{bold:true,size:16})),COLS[0],{fill:FILL}),cell(p(t('Enter',{bold:true,size:16})),COLS[1],{fill:FILL}),cell(p(t('How to count  ·  JobTread parameter',{bold:true,size:16})),COLS[2],{fill:FILL})]});
  return new Table({width:{size:W,type:WidthType.DXA},columnWidths:COLS,rows:[head,...rows.map(([m,enter,how,param])=>new TableRow({cantSplit:true,children:[
    cell(p(t(m,{bold:true,size:17})),COLS[0]),
    cell(p(t(enter,{size:17,color:'404040'})),COLS[1]),
    cell([p(t(how,{size:16})),...(param?[p([t(param,{mono:true,size:15,color:GREYTXT})],{after:0})]:[])],COLS[2])]}))]});
}
const box='☐';
const header=new Table({width:{size:W,type:WidthType.DXA},columnWidths:[2880,2880,2880,2880],rows:[
  new TableRow({children:['Job #','Customer','Date of visit','Sales rep'].map(h=>cell([p(t(h,{size:14,color:GREYTXT})),p(t(' ',{size:22}))],2880))}),
  new TableRow({children:[cell([p(t('Property address',{size:14,color:GREYTXT})),p(t(' ',{size:22}))],5760,{span:2}),cell([p(t('Photos uploaded to CompanyCam',{size:14,color:GREYTXT})),p(t(box+' Yes',{size:18}))],2880),cell([p(t('Bathroom (which one)',{size:14,color:GREYTXT})),p(t(' ',{size:22}))],2880)]})]});

const screen=new Table({width:{size:W,type:WidthType.DXA},columnWidths:[8520,1500,1500],rows:[
  new TableRow({children:[cell(p(t('Does any of this apply?',{bold:true,size:16})),8520,{fill:FILL}),cell(p(t('Yes',{bold:true,size:16}),{align:AlignmentType.CENTER}),1500,{fill:FILL}),cell(p(t('No',{bold:true,size:16}),{align:AlignmentType.CENTER}),1500,{fill:FILL})]}),
  ...['A structural wall is removed or opened','A plumbing fixture moves to a new location (drain or supply moves)','New foundation, footing or roof tie-in','HVAC extended or relocated beyond a register move','Cabinet layout or the room footprint changes'].map(q=>new TableRow({cantSplit:true,children:[cell(p(t(q,{size:17})),8520),cell(p(t(box,{size:22}),{align:AlignmentType.CENTER}),1500),cell(p(t(box,{size:22}),{align:AlignmentType.CENTER}),1500)]}))]});

const tierCols=[1500,3340,3340,3340];
const tiers=new Table({width:{size:W,type:WidthType.DXA},columnWidths:tierCols,rows:[
  new TableRow({children:[cell(p(t('',{size:16})),tierCols[0],{fill:FILL}),...['Good','Better','Best'].map((h,i)=>cell(p(t(box+'  '+h,{bold:true,size:18})),tierCols[i+1],{fill:FILL}))]}),
  ...[['Shower','Acrylic or fiberglass kit, framed glass','Onyx / Al-Co solid-surface panels, semi-frameless glass','Tile or large-format panels set by our sub, frameless glass'],
      ['Vanity','Stock cabinet, cultured-marble top','Semi-custom cabinet, quartz top','Custom cabinet, premium top'],
      ['Floor','Standard LVP','Upgraded LVP','Tile, set by our sub'],
      ['Fixtures','Builder-grade toilet, fan, lights','Mid-range','Designer']].map(r=>new TableRow({cantSplit:true,children:r.map((x,i)=>cell(p(t(x,{size:16,bold:i===0})),tierCols[i]))}))]});

const doc=new Document({
  styles:{default:{document:{run:{font:FONT,size:18}}}},
  sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:620,bottom:620,left:360*2,right:360*2}}},
    footers:{default:new Footer({children:[new Paragraph({children:[t('DRAFT 27 Sep 2026 · After the visit, enter each value into the job’s JobTread parameters, then add the "BALLPARK — Bathroom" cost group.   Page ',{size:14,color:GREYTXT}),new TextRun({children:[PageNumber.CURRENT],font:FONT,size:14,color:GREYTXT}),t(' of ',{size:14,color:GREYTXT}),new TextRun({children:[PageNumber.TOTAL_PAGES],font:FONT,size:14,color:GREYTXT})]})]})},
    children:[
      p([t('DEITEMEYER BROTHERS',{bold:true,size:16,color:NAVY})],{after:0}),
      p([t('Bathroom Site-Visit Intake',{bold:true,size:32})],{after:20}),
      p([t('Fill this in at the site visit. Every number feeds the bathroom ballpark in JobTread, which prices Good, Better and Best at once. Write 0 when something does not apply; do not leave it blank.',{size:17,color:'404040'})],{after:100}),
      header,
      heading('1  Does this project need the design step?'),
      p([t('If any answer is Yes, the next step after the budget range is the Design & Pricing Agreement. If every answer is No, it goes straight from the budget range to a fixed-price proposal.',{size:16,color:'404040'})],{after:60}),
      screen,
      heading('2  Room'),
      fieldTable([
        ['Bath floor area','___ ft × ___ ft = ____ SF','Wall to wall, the whole bathroom. Include a closet only if it is being remodeled.','{Bath Floor Area}'],
        ['Full gut?',box+' Whole room   '+box+' Shower only','Whole room to studs = 1. Shower or tub area only = 0.','{Full Gut}'],
        ['Walls moved','_______','Walls framed, removed or relocated. Count each wall.','{Walls Moved}'],
        ['Dumpster loads','_______','1 for almost every bathroom. 2 when other rooms are included.','{Dumpster Loads}'],
      ]),
      heading('3  Shower and tub'),
      fieldTable([
        ['New walk-in shower',box+' Yes (1)   '+box+' No (0)','Any new walk-in shower, including a tub-to-shower conversion.','{Walk-In Shower}'],
        ['New tub with shower',box+' Yes (1)   '+box+' No (0)','Tub and surround replaced as a tub/shower combo.','{Tub Shower Combo}'],
        ['Grab bars','_______','Count requested by the customer.','{Grab Bars}'],
        ['Existing shower or tub','________________','Size and type today, e.g. "60 in tub, fiberglass". For the estimator; not a formula input.',null],
      ]),
      heading('4  Plumbing'),
      fieldTable([
        ['Fixtures replaced in place','_______','Count the shower valve, each sink and the toilet when each stays where it is.','{Fixtures Replaced}'],
        ['Fixtures relocated','_______','Count each fixture whose drain or supply moves. Anything above 0 means the design step.','{Fixtures Relocated}'],
        ['HVAC work',box+' Yes (1)   '+box+' No (0)','Register moved or duct extended.','{HVAC Work}'],
        ['Supply pipe seen','Copper / PEX / Galv.','Circle one. Galvanized often adds repipe work; flag it in notes.',null],
      ]),
      heading('5  Vanity and toilet'),
      fieldTable([
        ['Vanity length','_______ ft','Width of the new vanity in feet. 0 if keeping the vanity.','{Vanity Length}'],
        ['Sinks','_______','Sinks in the new vanity.','{Vanity Sinks}'],
        ['New toilets','_______','0 if the existing toilet is only pulled and reset.','{Toilets}'],
      ]),
      heading('6  Floor'),
      fieldTable([
        ['New flooring area','_______ SF','All new flooring, including any past the bathroom door.','{New Flooring Area}'],
        ['Subfloor or joist repair','_______ SF','Soft or damaged area you can see or feel today. Hidden damage is handled by the contract’s unforeseen-conditions clause.','{Subfloor Repair Area}'],
      ]),
      heading('7  Electrical'),
      fieldTable([
        ['Exhaust fan',box+' Yes (1)   '+box+' No (0)','New or replaced fan with venting.','{Exhaust Fan}'],
        ['Light fixtures','_______','Vanity or ceiling fixtures being replaced.','{Light Fixtures}'],
        ['Recessed lights','_______','New recessed cans.','{Recessed Lights}'],
        ['Circuits added','_______','New circuits, GFCI runs, or outlets that need new wire.','{Circuits Added}'],
      ]),
      heading('8  Doors and travel'),
      fieldTable([
        ['Interior doors','_______','Swing doors replaced.','{Interior Doors}'],
        ['Pocket doors','_______','Pocket doors added.','{Pocket Doors}'],
        ['Travel hours','_______','Only when the job is past the standard service zone. Ask the CGM for the number.','{Travel Hours}'],
      ]),
      heading('9  What the customer wants'),
      p([t('Tick the level the customer leans toward. The ballpark shows all three, but this tells the estimator which one to lead with.',{size:16,color:'404040'})],{after:60}),
      tiers,
      p([t(' ',{size:8})],{after:40}),
      new Table({width:{size:W,type:WidthType.DXA},columnWidths:[3840,3840,3840],rows:[new TableRow({cantSplit:true,children:[
        cell([p(t('Budget the customer mentioned',{size:14,color:GREYTXT})),p(t('$',{size:22}))],3840),
        cell([p(t('Hoped-for start',{size:14,color:GREYTXT})),p(t(' ',{size:22}))],3840),
        cell([p(t('Decision-makers present',{size:14,color:GREYTXT})),p(t(box+' All   '+box+' Not all',{size:18}))],3840)]})]}),
      heading('10  Photos and notes'),
      p([t(box+' Each wall   '+box+' Shower/tub   '+box+' Floor and any soft spots   '+box+' Vanity and toilet   '+box+' Ceiling and fan   '+box+' Electrical panel   '+box+' Access path for materials',{size:17})],{after:60}),
      p([t('Must-haves, concerns, anything unusual:',{size:16,color:GREYTXT})],{after:0}),
      new Table({width:{size:W,type:WidthType.DXA},columnWidths:[W],rows:Array.from({length:3},()=>new TableRow({height:{value:380,rule:'atLeast'},children:[new TableCell({width:{size:W,type:WidthType.DXA},borders:{top:{style:BorderStyle.NONE,size:0,color:'FFFFFF'},left:{style:BorderStyle.NONE,size:0,color:'FFFFFF'},right:{style:BorderStyle.NONE,size:0,color:'FFFFFF'},bottom:border},children:[p(t(' ',{size:18}))]})]}))}),
    ]}]});
Packer.toBuffer(doc).then(b=>{fs.writeFileSync(require('path').join(__dirname,'..','bathroom-intake-sheet.docx'),b);console.log('ok')});
