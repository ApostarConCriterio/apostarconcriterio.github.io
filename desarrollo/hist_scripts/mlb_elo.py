import json,zipfile,glob,math,sys,csv,io,collections
sys.path.insert(0,'/home/claude/web/devig'); from devig import M as METHODS
NICK={'Angels':['ANA','LAA'],'Astros':['HOU'],'Athletics':['OAK','ATH'],'Blue Jays':['TOR'],'Braves':['ATL'],'Brewers':['MIL'],'Cardinals':['SLN'],'Cubs':['CHN'],'Diamondbacks':['ARI'],'Dodgers':['LAN'],'Giants':['SFN'],'Indians':['CLE'],'Guardians':['CLE'],'Mariners':['SEA'],'Marlins':['FLO','MIA'],'Mets':['NYN'],'Nationals':['WAS'],'Orioles':['BAL'],'Padres':['SDN'],'Phillies':['PHI'],'Pirates':['PIT'],'Rangers':['TEX'],'Rays':['TBA'],'Red Sox':['BOS'],'Reds':['CIN'],'Rockies':['COL'],'Royals':['KCA'],'Tigers':['DET'],'Twins':['MIN'],'White Sox':['CHA'],'Yankees':['NYA']}
G=[]
for f in sorted(glob.glob('/home/claude/web/hist/mlb/gl*.zip')):
    z=zipfile.ZipFile(f)
    for r in csv.reader(io.StringIO(z.read(z.namelist()[0]).decode('latin-1'))):
        d,num,vis,home=r[0],r[1],r[3],r[6]
        try: vs,hs=int(r[9]),int(r[10])
        except: continue
        G.append(dict(d=d,num=num,v=vis,h=home,vs=vs,hs=hs,vp=r[101],hp=r[103],season=d[:4]))
G.sort(key=lambda g:(g['d'],g['num']))
odds={}
for o in json.load(open('/home/claude/web/hist/mlb/mlb_archive_10Y.json')):
    try:d=str(int(o['date']))
    except:continue
    for code in NICK.get(o['home_team'],[]):
        odds.setdefault((d,code),[]).append(o)
def dec(m):
    try:m=float(m)
    except:return None
    if not m or abs(m)<100:return None
    return 1+m/100 if m>0 else 1+100/(-m)
def run(K=4,HFA=24,carry=0.67,pw=0,N=10):
    R={};last=None;out=[];pit=collections.defaultdict(list);lg=[]
    for g in G:
        if g['season']!=last:
            for t in R:R[t]=1500*(1-carry)+R[t]*carry
            last=g['season']
        rh,ra=R.get(g['h'],1500),R.get(g['v'],1500)
        avg=(sum(lg[-2000:])/len(lg[-2000:])) if lg else 4.4
        def padj(p):
            L=pit[p][-N:]
            if len(L)<3:return 0
            return (avg-sum(L)/len(L))  # runs allowed below average = better
        dif=rh+HFA-ra+pw*(padj(g['hp'])-padj(g['vp']))
        p=1/(1+10**(-dif/400));y=1 if g['hs']>g['vs'] else 0
        out.append((g,p,y))
        mov=math.log(abs(g['hs']-g['vs'])+1)
        ch=K*mov*(y-p);R[g['h']]=rh+ch;R[g['v']]=ra-ch
        pit[g['hp']].append(g['vs']);pit[g['vp']].append(g['hs']);lg.append(g['hs']);lg.append(g['vs'])
    return out
def ll(ps):return -sum(math.log(min(max(p if y else 1-p,1e-9),1)) for p,y in ps)/len(ps)
best=None
for K in (3,4,6):
  for pw in (0,10,20,30):
    o=run(K=K,pw=pw);tr=[(p,y) for g,p,y in o if '2012'<=g['season']<='2016']
    v=ll(tr)
    if not best or v<best[0]:best=(v,K,pw)
print('mejor entrenamiento 2012-2016',best)
o=run(K=best[1],pw=best[2])
test=[]
used=collections.Counter()
for g,p,y in o:
    if not('2017'<=g['season']<='2021'):continue
    L=odds.get((g['d'],g['h']))
    if not L:continue
    i=used[(g['d'],g['h'])];used[(g['d'],g['h'])]+=1
    if i>=len(L):continue
    od=L[i];dh,da=dec(od['home_close_ml']),dec(od['away_close_ml'])
    if not dh or not da or 1/dh+1/da<1:continue
    if od.get('home_final') is not None and int(od['home_final'])!=g['hs']:continue
    test.append((p,y,dh,da))
print('prueba 2017-2021 partidos con cuota',len(test))
print('modelo Elo + lanzador',round(ll([(p,y) for p,y,_,_ in test]),5))
mk={}
for k,fn in METHODS.items():
    mk[k]=[]
    for p,y,dh,da in test:
        q=fn([dh,da]);q=q if q and min(q)>0 else METHODS['proporcional']([dh,da]);mk[k].append(q[0])
    print('mercado',k,round(ll([(q,y) for q,(p,y,_,_) in zip(mk[k],test)]),5))
for w in (0.1,0.2,0.3):
    print('mezcla',w,round(ll([((1-w)*q+w*p,y) for q,(p,y,_,_) in zip(mk['proporcional'],test)]),5))
