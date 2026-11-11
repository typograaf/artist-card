import numpy as np, json
from PIL import Image
pal = np.array([[8,4,252],[124,156,252],[248,124,0],[252,164,24],[252,236,160],[0,0,0]],dtype=float)
def cls(line):
    d=((line[:,None,:].astype(float)-pal[None])**2).sum(-1); c=d.argmin(-1); c[d.min(-1)>900]=6; return c
def runs(c,a,b):
    out=[]; s=a
    for x in range(a+1,b):
        if c[x]!=c[s]: out.append((int(c[s]),s,x-s)); s=x
    out.append((int(c[s]),s,b-s)); return out
d=json.load(open('analysis/track.json'))
ys={0:84,1:252,2:421,3:540,4:740,5:930,6:1060,7:1310}
res={r:[] for r in ys}
for f in range(1,301):
    im=np.array(Image.open(f'frames/f{f:03d}.png').convert('RGB'))
    for r,y in ys.items():
        c=cls(im[y]); l,rr=d['hole'][str(r)][f-1]
        segs=[]
        for a,b in [(0,l),(rr,1080)]:
            if b-a<60: continue
            rs=[x for x in runs(c,a,b) if x[0]<4]
            inner=rs[1:-1] if len(rs)>2 else rs
            if inner: segs.append(int(np.median([x[2] for x in inner])))
            else: segs.append(None)
        res[r].append(segs)
for r in ys:
    print('row',r)
    line=[]
    for f in range(0,300,3):
        s=res[r][f]; line.append(f"{f+1}:{'/'.join('-' if v is None else str(v) for v in s)}")
    print('  '+' '.join(line))
