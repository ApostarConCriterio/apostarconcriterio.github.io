import csv,glob,math,collections,json,sys
def load(tour):
    M=[]
    for f in sorted(glob.glob(f'/home/claude/web/hist/tenis/{tour}_*.csv')):
        for r in csv.DictReader(open(f,encoding='utf-8',errors='replace')):
            if not r.get('winner_name') or 'W/O' in (r.get('score') or '') or r.get('tourney_level') in ('D',): continue
            M.append((r['tourney_date'],int(r.get('match_num') or 0),r['surface'] or 'Hard',r['winner_name'],r['loser_name'],r.get('score','')))
    M.sort();return M
def run(M,a=250,b=5,c=0.4,w=0.5):
    R=collections.defaultdict(lambda:1500.0);S=collections.defaultdict(lambda:1500.0);N=collections.Counter();NS=collections.Counter();out=[]
    for d,_,surf,wn,ln,sc in M:
        k=(surf,)
        pw=1/(1+10**((R[ln]-R[wn])/400));ps=1/(1+10**((S[(surf,ln)]-S[(surf,wn)])/400))
        p=(1-w)*pw+w*ps
        out.append((d,p,N[wn],N[ln]))
        for (D,key_w,key_l,n_w,n_l,pp) in ((R,wn,ln,N[wn],N[ln],pw),(S,(surf,wn),(surf,ln),NS[(surf,wn)],NS[(surf,ln)],ps)):
            kw=a/((n_w+b)**c);kl=a/((n_l+b)**c)
            D[key_w]+=kw*(1-pp);D[key_l]-=kl*(1-pp)
        N[wn]+=1;N[ln]+=1;NS[(surf,wn)]+=1;NS[(surf,ln)]+=1
    return out,R,S,N
def ll(o):return -sum(math.log(p) for _,p,_,_ in o)/len(o)
res={}
for tour in ('atp','wta'):
    M=load(tour);print(tour,'partidos',len(M),M[0][0],M[-1][0])
    best=None
    for w in (0.3,0.5,0.7):
        for c in (0.3,0.4):
            o,_,_,_=run(M,c=c,w=w);tr=[x for x in o if '2016'<=x[0][:4]<='2021' and x[2]>=20 and x[3]>=20]
            v=ll(tr)
            if not best or v<best[0]:best=(v,c,w)
    o,R,S,N=run(M,c=best[1],w=best[2])
    te=[x for x in o if x[0][:4]>='2023' and x[2]>=20 and x[3]>=20]
    acc=sum(1 for x in te if x[1]>0.5)/len(te)
    bins=collections.defaultdict(lambda:[0,0])
    for x in te:
        p=max(x[1],1-x[1]);b=min(int(p*10),9);bins[b][0]+=1;bins[b][1]+=(1 if x[1]>=0.5 else 0)
    print(' mejor',best,'prueba 2023+:',len(te),'logloss',round(ll(te),4),'acierto',round(acc,3))
    print(' calibración', {k/10:(v[0],round(v[1]/v[0],3)) for k,v in sorted(bins.items())})
    last=M[-1][0]
    top={n:[round(R[n],1),{s:round(S[(s,n)],1) for s in ('Hard','Clay','Grass') if (s,n) in S},N[n]] for n in R if N[n]>=10}
    res[tour]={'hasta':last,'params':{'c':best[1],'w':best[2]},'jugadores':top,'logloss_prueba':round(ll(te),4),'n_prueba':len(te)}
json.dump(res,open('/home/claude/web/hist/tenis_elo.json','w'))
print('jugadores con rating',{t:len(res[t]['jugadores']) for t in res})
