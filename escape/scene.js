let W=0,H=0,S=1,D=1;
const point=(x,y,z)=>[W*.5+(x*.92-z*.46)*S,H*.55+(x*.225+z*.50-y*.92)*S];
function poly(points,color,edge){ctx.beginPath();points.forEach((p,i)=>{const v=point(...p);if(i)ctx.lineTo(...v);else ctx.moveTo(...v)});ctx.closePath();ctx.fillStyle=color;ctx.fill();if(edge){ctx.strokeStyle=edge;ctx.lineWidth=.7;ctx.stroke()}}
function box(x,z,w,d,y,h,top,front,side){let X=x+w,Z=z+d,Y=y+h;poly([[x,y,Z],[X,y,Z],[X,Y,Z],[x,Y,Z]],front);poly([[X,y,z],[X,y,Z],[X,Y,Z],[X,Y,z]],side);poly([[x,Y,z],[X,Y,z],[X,Y,Z],[x,Y,Z]],top)}
function flat(x,z,w,d,y,c){poly([[x,y,z],[x+w,y,z],[x+w,y,z+d],[x,y,z+d]],c)}
function ellipse(x,y,z,rx,ry,c){const [a,b]=point(x,y,z);ctx.beginPath();ctx.ellipse(a,b,rx*S,ry*S,0,0,Math.PI*2);ctx.fillStyle=c;ctx.fill()}
function pill(x,y,z,txt,theme,active,room){let [a,b]=point(x,y,z);const fs=W<510?10:12;ctx.font='bold '+fs+'px system-ui';const tw=ctx.measureText(txt).width+16,h=fs+9;ctx.fillStyle=active?'#364238':'#102029ed';ctx.strokeStyle=active?'#ffd284':theme;ctx.lineWidth=active?1.5:.8;ctx.beginPath();ctx.roundRect(a-tw/2,b-h/2,tw,h,4);ctx.fill();ctx.stroke();ctx.fillStyle=active?'#ffe6a1':theme;ctx.textBaseline='middle';ctx.textAlign='center';ctx.fillText(txt,a,b);if(room!==undefined)labels.push({x:a-tw/2-3,y:b-h/2-3,w:tw+6,h:h+6,i:room})}
const shades=[['#54726a','#293e3b','#74988a'],['#86715a','#453f37','#b09b77'],['#536b7f','#2d3e4c','#839bad'],['#776575','#463947','#a492a4']];
function roomFloor(i){const p=people[i],a=p.x-3.75,b=p.z-2.15,c=shades[i];
 box(a-.10,b-.10,7.70,4.50,-.47,.45,c[0],c[1],'#26333a');
 for(let x=0;x<6;x++)for(let z=0;z<4;z++)flat(a+x*1.25,b+z*1.075,1.23,1.055,0,(x+z)%2?c[0]:c[2]+'a8');
 box(a,b,7.5,.12,0,1.03,c[2],c[0],c[1]);box(a,b,.12,4.3,0,.72,c[2],c[0],c[1]);
 box(a+.08,b+.13,7.24,.055,.85,.065,p.color,p.color,c[1]);
 for(let n=0;n<4;n++)box(a+.7+1.9*n,b+.14,.10,.08,.05,.68,c[2],c[1],c[1]);
 flat(a+.18,b+3.85,2.45,.10,.015,p.color);flat(a+6.83,b+2.76,.09,1.11,.015,p.color);
}
function desk(x,z,w=2.2){box(x+.12,z+.12,.22,.68,.02,.67,'#62716c','#334345','#273638');box(x+w-.32,z+.12,.22,.68,.02,.67,'#62716c','#334345','#273638');box(x,z,w,.95,.68,.14,'#b49f7b','#776b54','#5e584a')}
function monitor(x,z,w=1){box(x+w*.39,z+.03,.16,.15,.83,.16,'#718980','#47595a','#354748');box(x,z,w,.14,.99,.60,'#789087','#253c42','#3e5553');box(x+.07,z+.15,w-.14,.018,1.06,.44,'#678878','#355853','#355853');for(let i=0;i<6;i++){const ht=.08+(i*7%5)*.058;box(x+.12+i*w*.125,z+.17,w*.055,.01,1.1,ht,'#a8e5b5','#9ae0b5','#94b9a0')}}
function speaker(x,z){box(x,z,.62,.58,.02,1.55,'#6e7976','#29383c','#394648');for(const y of [.40,1.04]){const [a,b]=point(x+.31,y,z+.59);ctx.fillStyle='#11232c';ctx.beginPath();ctx.ellipse(a,b,.19*S,.21*S,-.25,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#74827b';ctx.stroke()}}
function crate(x,z,y=0,w=1.25){box(x,z,w,.85,y,.70,'#c5a178','#94714e','#745a43');box(x+w*.36,z,w*.15,.85,y+.70,.025,'#dfbe8e','#b18b62','#92785c');box(x+w*.36,z+.85,w*.15,.015,y,.70,'#d4b280','#b5956d','#a58052');box(x+.08,z+.87,.22,.01,y+.29,.18,'#e5cf9e','#dbc59b','#ae9872')}
function shelf(x,z,w=2.3){box(x,z,.15,.7,0,1.93,'#a99179','#685f53','#504b43');box(x+w-.15,z,.15,.7,0,1.93,'#a99179','#685f53','#504b43');for(let l=0;l<3;l++){const y=.1+l*.66;box(x,z,w,.7,y,.09,'#b79c79','#8c765c','#675849');for(let k=0;k<7;k++){const tone=['#82998b','#c29976','#7c8da3','#b198aa'][(k+l)%4];box(x+.17+k*(w-.36)/7,z+.10,.19,.48,y+.10,.40+(k%3)*.07,tone,tone,'#5b6061');box(x+.21+k*(w-.36)/7,z+.585,.10,.015,y+.23,.045,'#dad1b6','#dad1b6','#bbb')}}}
function rack(x,z){box(x,z,1.18,.68,0,1.86,'#9aa9a4','#475b64','#34434b');for(let k=0;k<4;k++){const y=.2+k*.39;box(x+.10,z+.69,.97,.018,y,.27,'#556c70','#243841','#30454b');for(let n=0;n<4;n++)box(x+.18+n*.2,z+.72,.085,.015,y+.075,.08,'#b9d09f',n%3===0?'#efb96f':'#9fd2b1','#56776b')}}
function avatar(i,t,moving){const a=actors[i],c=people[i].color;ellipse(a.x,.025,a.z,.45,.19,'#0b1a1a7d');if(i===s.seat){const [u,v]=point(a.x,.04,a.z);ctx.beginPath();ctx.ellipse(u,v,.51*S,.24*S,0,0,Math.PI*2);ctx.strokeStyle='#ffdc88';ctx.lineWidth=1.6;ctx.stroke()}
 const bob=moving?.055*Math.abs(Math.sin(t/75)):0;
 for(const f of [-.24,.05])box(a.x+f,a.z-.13,.18,.29,.04,.24,'#616d66','#374a47','#2c3d3e');
 box(a.x-.31,a.z-.18,.62,.38,.26+bob,.46,c,c,'#657672');box(a.x-.28,a.z-.21,.56,.43,.73+bob,.42,'#f0d1a3','#dcc098','#b19880');box(a.x-.32,a.z-.23,.64,.46,1.09+bob,.13,c,c,'#657672');box(a.x-.14,a.z+.227,.07,.016,.93+bob,.07,'#283236','#283236','#283236');box(a.x+.09,a.z+.227,.07,.016,.93+bob,.07,'#283236','#283236','#283236');
 if(i===s.seat)pill(a.x,1.68,a.z,(roster[i]?.name || people[i].name),c,true)}
function draw(time){const w=canvas.clientWidth,h=canvas.clientHeight,d=Math.min(2,window.devicePixelRatio||1);if(w!==W||h!==H||d!==D){W=w;H=h;D=d;canvas.width=Math.round(w*d);canvas.height=Math.round(h*d)}if(!W||!H)return;ctx.setTransform(D,0,0,D,0,0);S=Math.min(W/22.7,H/11.6);
 const grad=ctx.createRadialGradient(W*.5,H*.55,1,W*.5,H*.52,W*.66);grad.addColorStop(0,'#34505a');grad.addColorStop(.58,'#22333c');grad.addColorStop(1,'#11202a');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);for(let n=-20;n<21;n++){flat(n,-20,.012,40,-.9,'#8cb3b217');flat(-20,n,40,.012,-.9,'#8cb3b217')}
 box(-8.9,-.92,17.8,1.84,-.40,.40,'#6d7e75','#394c4a','#334649');box(-1.15,-5.45,2.3,10.9,-.4,.4,'#738077','#394c4a','#334649');
 for(let n=-8;n<=8;n++)flat(n,-.05,.36,.07,.012,'#d4bc82');for(let n=-5;n<=5;n++)flat(-.03,n,.07,.36,.012,'#d4bc82');
 people.forEach((_,i)=>roomFloor(i));const q=[];function add(x,z,fn){q.push({depth:x*.46+z*.92,fn})}
 add(-7.9,-4.65,()=>{desk(-7.9,-4.65,3.1);monitor(-7.7,-4.50,1.26);monitor(-6.15,-4.5,.98);for(let j=0;j<5;j++)flat(-7.55+j*.24,-3.94,.14,.20,.831,'#526b6a')});
 add(-2.95,-4.9,()=>speaker(-2.95,-4.9));add(-8.1,-2.15,()=>speaker(-8.1,-2.15));
 add(2.1,-5.12,()=>{crate(2.1,-5.12);crate(3.4,-5.12);crate(2.35,-5.12,.71)});add(6.85,-4.85,()=>{crate(6.85,-4.85);crate(6.9,-4.85,.71)});add(7.25,-2.15,()=>crate(7.25,-2.15));
 add(-8.15,1.49,()=>rack(-8.15,1.49));add(-6.75,1.49,()=>rack(-6.75,1.49));add(-3.35,1.55,()=>{desk(-3.35,1.55,1.71);monitor(-3.13,1.66,.98)});
 add(1.9,1.48,()=>shelf(1.9,1.48));add(4.5,1.48,()=>shelf(4.5,1.48,2.7));add(6.57,3.85,()=>{desk(6.57,3.85,1.71);flat(6.8,4.02,.82,.52,.83,'#ead4a8')});
 people.forEach((p,i)=>{const x=p.x,z=p.z;add(x,z-.4,()=>{ellipse(x,.03,z-.56,.39,.16,p.color+'60');box(x-.12,z-.72,.24,.20,.04,.30,p.color,p.color,'#6b807a');box(x-.16,z-.76,.32,.27,.32,.1,'#fff0bc',p.color,'#68776c')})});
 actors.forEach((a,i)=>a&&add(a.x,a.z,()=>avatar(i,time,i===s.seat&&(movingNow))));q.sort((a,b)=>a.depth-b.depth).forEach(a=>a.fn());
 labels=[];people.forEach((p,i)=>pill(p.x,.12,p.z+1.52,(teamFlags[i]?'✓ ':'')+p.room,p.color,s.seat===i&&s.phase===0,i));}
