import json,time,concurrent.futures,urllib.request,urllib.parse
from html.parser import HTMLParser
from pathlib import Path
routes=json.loads(Path(__file__).with_name('routes.json').read_text())
class Links(HTMLParser):
 def __init__(self):super().__init__();self.old=[];self.resources=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  for key in ['href','src','srcset','data','poster']:
   if not a.get(key):continue
   v=a[key]
   if 'alageum.com' in v.lower() and not v.lower().startswith('mailto:'):self.old.append({'tag':tag,'attribute':key,'value':v})
   if key in ['src','poster','data'] and tag in ['img','iframe','object','embed','video','source']:self.resources.append(v)
def scan(route):
 try:
  with urllib.request.urlopen('http://localhost:3000'+route,timeout=55) as r:status=r.status;html=r.read().decode('utf8')
  p=Links();p.feed(html)
  return {'route':route,'status':status,'old':p.old,'resources':p.resources}
 except Exception as e:return {'route':route,'error':str(e)}
results=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for result in pool.map(scan,routes):results.append(result)
Path('docs/legacy-link-cleanup-2026-11-01/http-audit.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'routes':len(results),'errors':[r for r in results if 'error'in r],'outbound':[r for r in results if r.get('old')]},ensure_ascii=False))
