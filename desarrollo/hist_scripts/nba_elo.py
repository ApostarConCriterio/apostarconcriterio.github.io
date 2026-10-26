import sqlite3,math,sys
sys.path.insert(0,'/home/claude/web/devig'); from devig import M as METHODS
c=sqlite3.connect('/home/claude/web/hist/nba/odds.sqlite')
tabs=[r[0] for r in c.execute("select name from sqlite_master where type='table'")]
rows={}
for t in tabs:
    if not t.startswith('odds_'): continue
    season=t[5:12]
    for r in c.execute(f'select Date,Home,Away,ML_Home,ML_Away,Win_Margin,Days_Rest_Home,Days_Rest_Away from "{t}"'):
        d,h,a,mh,ma,wm,rh,ra=r
        if wm is None or wm==0: continue
        k=(d,h,a)
        rows[k]=(season,d,h,a,mh,ma,wm,rh,ra)
G=sorted(rows.values(),key=lambda x:x[1])
print('partidos',len(G),G[0][1],G[-1][1])
def dec(m):
    try:m=float(m)
    except:return None
    if m==0 or abs(m)<100: return None
    return 1+m/100 if m>0 else 1+100/(-m)
def run(K=20,HFA=70,carry=0.75,rest=0,mov=True):
    R={};last=None;out=[]
    for s,d,h,a,mh,ma,wm,rh,ra in G:
        if s!=last:
            for t in R: R[t]=1505*(1-carry)+R[t]*carry
            last=s
        rh_=R.get(h,1500);ra_=R.get(a,1500)
        adj=HFA+rest*((min(rh or 2,3)>=2)-(min(ra or 2,3)>=2))
        dif=rh_+adj-ra_;p=1/(1+10**(-dif/400))
        y=1 if wm>0 else 0
        out.append((s,p,y,dec(mh),dec(ma)))
        m=abs(wm);mult=((m+3)**0.8)/(7.5+0.006*(dif if y else -dif)) if mov else 1
        ch=K*mult*(y-p);R[h]=rh_+ch;R[a]=ra_-ch
    return out
def ll(ps):return -sum(math.log(p if y else 1-p) for p,y in ps)/len(ps)
best=None
for K in (15,20,25):
  for HFA in (50,70,90):
    for carry in (0.6,0.75):
      o=run(K,HFA,carry);tr=[(p,y) for s,p,y,_,_ in o if '2012'<=s[:4]<'2019']
      v=ll(tr)
      if not best or v<best[0]:best=(v,K,HFA,carry)
print('mejor en entrenamiento 2012-2018:',best)
o=run(best[1],best[2],best[3])
test=[x for x in o if x[0][:4]>='2019' and x[3] and x[4]]
mk={k:[] for k in METHODS};mods=[]
for s,p,y,dh,da in test:
    for k,fn in METHODS.items():
        q=fn([dh,da]); q=q if q and min(q)>0 else METHODS['proporcional']([dh,da]); mk[k].append((q[0],y))
    mods.append((p,y))
print('prueba 2019+ partidos',len(test))
print('modelo Elo',round(ll(mods),5))
for k in mk: print('mercado',k,round(ll(mk[k]),5))
mo=[q for q,_ in mk['odds_ratio']]
for w in (0.1,0.2,0.3):
    bl=[(min(max((1-w)*q+w*p,1e-6),1-1e-6),y) for (p,y),q in zip(mods,mo)]
    print('mezcla',w,round(ll(bl),5))
