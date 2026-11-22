"""Independent reference implementation of the standard definitions (Coggan & Allen; Banister EWMA).
Shares no code with Massif. 1 Hz inputs."""
import math, json, random
def np_ref(p):
    roll=[sum(p[i-29:i+1])/30 for i in range(29,len(p))]
    return (sum(x**4 for x in roll)/len(roll))**0.25
def tss_ref(p,ftp):
    n=np_ref(p); return len(p)/3600*n*(n/ftp)/ftp*100
def mmp(p,d):
    s=sum(p[:d]); b=s
    for i in range(d,len(p)): s+=p[i]-p[i-d]; b=max(b,s)
    return b/d
def pmc_exp(loads,tc):           # Banister/TrainingPeaks exponential form
    k=1-math.exp(-1/tc); v=0; out=[]
    for L in loads: v=v+(L-v)*k; out.append(v)
    return out
def fixtures():
    random.seed(7)
    F={}
    F["const185"]=[185]*3600
    F["250_120"]=[250]*1800+[120]*1800
    # interval session: 15 min warm-up 150, 5x(4 min 300 / 4 min 130), cool 150; with 1 Hz noise
    s=[150]*900
    for _ in range(5): s+= [300]*240+[130]*240
    s+= [150]*600
    F["intervals"]=[max(0,round(x+random.gauss(0,12))) for x in s]
    # 5 h endurance with 10% coasting zeros and a 15 s sprint
    e=[]
    for i in range(5*3600):
        e.append(0 if random.random()<0.10 else max(0,round(170+random.gauss(0,20))))
    for i in range(7200,7215): e[i]=820
    F["long5h"]=e
    return F
if __name__=="__main__":
    out={}
    for k,p in fixtures().items():
        out[k]={"np":np_ref(p),"tss185":tss_ref(p,185),"vi":np_ref(p)/(sum(p)/len(p)),
                **{f"mmp{d}":mmp(p,d) for d in (5,60,300,1200,3600) if len(p)>=d}}
    out["ctl42"]=pmc_exp([100]*42,42)[-1]; out["atl7"]=pmc_exp([100]*7,7)[-1]
    json.dump({"ref":out,"fixtures":fixtures()},open("fixtures.json","w"))
    print(json.dumps(out,indent=1))
