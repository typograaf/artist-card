import numpy as np, json, sys
from PIL import Image
W,H=1080,1350
N=300
# palette: 0 blue,1 lightblue,2 darkorange,3 lightorange,4 cream,5 black
pal = np.array([[8,4,252],[124,156,252],[248,124,0],[252,164,24],[252,236,160],[0,0,0]],dtype=float)
# scanline y per band (avoid labels)
rows = {0:(60,110),1:(200,320),2:(360,490),3:(515,558),4:(728,746),5:(880,1000),6:(1020,1095),7:(1290,1345)}
labels = {'stage':600,'date':800,'artist':1200}
def classify(line):
    d=((line[:,None,:].astype(float)-pal[None,:,:])**2).sum(-1)
    cls=d.argmin(-1); dm=d.min(-1)
    cls[dm>900]=6   # photo / other
    return cls
out={'hole':{r:[] for r in rows},'shiftL':{r:[] for r in rows},'shiftR':{r:[] for r in rows},'labels':{k:[] for k in labels}}
prev={}
for f in range(1,N+1):
    im=np.array(Image.open(f'frames/f{f:03d}.png').convert('RGB'))
    for r,(y0,y1) in rows.items():
        ys=list(range(y0,y1,4))
        lines=[classify(im[y]) for y in ys]
        # hole: from center, walk outward until a pattern pixel (class 0-3) is hit, on majority of lines
        pattern=np.stack([np.isin(l,[0,1,2,3]) for l in lines]).mean(0)>0.5
        c=W//2
        l=c
        while l>0 and not pattern[l-1]: l-=1
        rr=c
        while rr<W and not pattern[rr]: rr+=1
        # if center itself is pattern -> hole 0
        if pattern[c] and pattern[c-1]: l=rr=c
        out['hole'][r].append([int(l),int(rr)])
        # shift via cross-correlation of the class line (pattern only) vs prev frame, left half and right half separately
        cur=np.stack(lines)
        if r in prev:
            pv=prev[r]
            res=[]
            for (a,b) in [(0,l-5 if l>60 else c), (rr+5 if rr<W-60 else c, W)]:
                best=None
                if b-a>120:
                    seg=cur[:,a:b]
                    for s in range(-70,71):
                        a2,b2=a+s,b+s
                        if a2<0 or b2>W: continue
                        ps=pv[:,a2:b2]
                        m=(seg<4)&(ps<4)
                        if m.sum()<100: continue
                        score=((seg==ps)&m).sum()/m.sum()
                        if best is None or score>best[0]: best=(score,s)
                res.append(best[1] if best else None)
            out['shiftL'][r].append(res[0]); out['shiftR'][r].append(res[1])
        else:
            out['shiftL'][r].append(0); out['shiftR'][r].append(0)
        prev[r]=cur
    for k,y in labels.items():
        cl=classify(im[y])
        xs=np.where(np.isin(cl,[4,5]))[0]
        out['labels'][k].append([int(xs.min()),int(xs.max())] if len(xs) else None)
    if f%50==0: print('frame',f,file=sys.stderr)
json.dump(out,open('analysis/track.json','w'))
print('done')
