import numpy as np
from PIL import Image
from collections import Counter
im = np.array(Image.open('frames/f001.png').convert('RGB'))
H,W,_ = im.shape
print('size', W, H)
# dominant colors overall
flat = im.reshape(-1,3)
q = (flat//4)*4
c = Counter(map(tuple,q))
for col,n in c.most_common(8):
    print(col, n)
# per-row (8 bands) transitions on a scanline in the middle of each band
bands = [(0,168),(168,337),(337,505),(505,675),(675,845),(845,1015),(1015,1185),(1185,1350)]
for i,(y0,y1) in enumerate(bands):
    ys = [y0+20, (y0+y1)//2, y1-20]
    for y in ys:
        line = im[y]
        # classify each pixel to nearest of palette
        pal = np.array([[0,0,255],[124,160,255],[255,131,0],[255,172,0],[255,240,170],[0,0,0]])
        d = ((line[:,None,:].astype(int)-pal[None,:,:])**2).sum(-1)
        cls = d.argmin(-1)
        # run-length
        runs=[]; s=0
        for x in range(1,W):
            if cls[x]!=cls[x-1]:
                runs.append((int(cls[s]),s,x-s)); s=x
        runs.append((int(cls[s]),s,W-s))
        print(f'band{i} y={y}:', [(k,st,ln) for k,st,ln in runs if ln>3][:30])
