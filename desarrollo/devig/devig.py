import csv,glob,math,sys
from scipy.optimize import brentq
def mult(o):
    r=[1/x for x in o];s=sum(r);return [x/s for x in r]
def add(o):
    r=[1/x for x in o];m=(sum(r)-1)/len(r);p=[x-m for x in r]
    return p if min(p)>0 else None
def power(o):
    r=[1/x for x in o]
    f=lambda k:sum(x**k for x in r)-1
    k=brentq(f,0.5,10);return [x**k for x in r]
def shin(o):
    r=[1/x for x in o];S=sum(r);n=len(o)
    def ps(z):return [(math.sqrt(z*z+4*(1-z)*x*x/S)-z)/(2*(1-z)) for x in r]
    f=lambda z:sum(ps(z))-1
    try: z=brentq(f,0,0.4)
    except Exception: return mult(o)
    return ps(z)
def oratio(o):
    r=[1/x for x in o]
    f=lambda c:sum(x/(c+x-c*x) for x in r)-1
    c=brentq(f,1,10);return [x/(c+x-c*x) for x in r]
M={'proporcional':mult,'aditivo':add,'potencia':power,'shin':shin,'odds_ratio':oratio}
def evaluate(rows,name):
    out={}
    for k,fn in M.items():
        ll=0;n=0;br=0
        for o,y in rows:
            p=fn(o)
            if not p or min(p)<=0: p=mult(o)
            ll-=math.log(max(p[y],1e-9));n+=1;br+=sum((p[i]-(1 if i==y else 0))**2 for i in range(len(o)))
        out[k]=(ll/n,br/n)
    best=min(out,key=lambda k:out[k][0])
    print(f"\n{name}  (n={len(rows)})");[print(f"  {k:13s} logloss {v[0]:.5f}  brier {v[1]:.5f}{'  <- mejor' if k==best else ''}") for k,v in out.items()]
    return out
def fl(x):
    try:return float(x)
    except:return None
def football(cols,files,ycol='FTR'):
    rows=[]
    for f in files:
        for r in csv.DictReader(open(f,encoding='latin-1')):
            o=[fl(r.get(c)) for c in cols]
            if not all(o) or min(o)<=1: continue
            y={'H':0,'D':1,'A':2}.get(r.get(ycol) or r.get('Res'))
            if y is None: continue
            s=sum(1/x for x in o)
            if s<1 or s>1.25: continue
            rows.append((o,y))
    return rows
if __name__=='__main__':
    main=[f for f in glob.glob('/home/claude/web/src/res/[0-9]*_*.csv')]
    new=glob.glob('/home/claude/web/src/res/new_*.csv')
    evaluate(football(['PSCH','PSCD','PSCA'],main),'Fútbol 1X2 · Pinnacle cierre (ligas principales)')
    evaluate(football(['B365CH','B365CD','B365CA'],main),'Fútbol 1X2 · Bet365 cierre (ligas principales)')
    evaluate(football(['AvgCH','AvgCD','AvgCA'],main),'Fútbol 1X2 · promedio de casas, cierre')
    evaluate(football(['PSCH','PSCD','PSCA'],new),'Fútbol 1X2 · Pinnacle cierre (ligas nuevas: Argentina, Brasil, etc.)')
    # O/U 2.5 two-way
    rows=[]
    for f in main:
        for r in csv.DictReader(open(f,encoding='latin-1')):
            o=[fl(r.get('PC>2.5')),fl(r.get('PC<2.5'))]
            if not all(o): continue
            try:g=int(r['FTHG'])+int(r['FTAG'])
            except:continue
            if sum(1/x for x in o)<1: continue
            rows.append((o,0 if g>2.5 else 1))
    evaluate(rows,'Fútbol más/menos 2,5 · Pinnacle cierre (2 resultados)')
    rows=[]
    for r in csv.DictReader(open('/home/claude/web/sports/nfl_games.csv')):
        a,h=fl(r['away_moneyline']),fl(r['home_moneyline'])
        if a is None or h is None or r['home_score']=='' : continue
        d=lambda m:1+m/100 if m>0 else 1+100/(-m)
        hs,as_=int(r['home_score']),int(r['away_score'])
        if hs==as_: continue
        o=[d(h),d(a)]
        if sum(1/x for x in o)<1: continue
        rows.append((o,0 if hs>as_ else 1))
    evaluate(rows,'NFL ganador · cierre (2 resultados)')
